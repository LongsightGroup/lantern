import type { Hono } from '@hono/hono';
import {
  readBearerToken,
  readRuntimeFileRequest,
  requireTrimmedString,
} from './app_request_support.ts';
import {
  errorMessage,
  statusForFinalizePublishError,
  statusForRuntimeError,
} from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { requireRuntimeSession } from './app_runtime_support.ts';
import { acceptAttemptEvent, finalizeRuntimeAttempt } from './runtime/gateway.ts';
import {
  authorizeRuntimeSession,
  contentTypeForRuntimePath,
  loadRuntimeActivityContent,
  loadRuntimeAssetBytes,
  renderRuntimeSessionPage,
} from './runtime/session.ts';

export function registerRuntimeRoutes(app: Hono, services: AppServices): void {
  app.get('/runtime/sessions/:sessionId', async (context) => {
    try {
      const repository = services.getRepository();
      const session = await requireRuntimeSession(repository, context.req.param('sessionId'));
      const url = new URL(context.req.url);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          url.searchParams.get('token'),
          'Runtime session token is required.',
        ),
        expected: session,
      });

      return context.html(await renderRuntimeSessionPage(session));
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get('/runtime/sessions/:sessionId/content', async (context) => {
    try {
      const repository = services.getRepository();
      const session = await requireRuntimeSession(repository, context.req.param('sessionId'));

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header('authorization')),
          'Runtime session token is required.',
        ),
        expected: session,
      });

      const content = await loadRuntimeActivityContent(session);

      if (session.preview !== undefined) {
        await repository.appendPreviewEvidence({
          previewSessionId: session.preview.previewSessionId,
          eventType: 'preview.content_read',
          capability: 'read_activity_content',
          summary: 'Read reviewed activity content from the governed preview runtime.',
          detail: {
            attemptId: session.attemptId,
            contentPath: session.contentPath,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      return context.json(content);
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.post('/runtime/sessions/:sessionId/attempt-events', async (context) => {
    try {
      const repository = services.getRepository();
      const session = await requireRuntimeSession(repository, context.req.param('sessionId'));

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header('authorization')),
          'Runtime session token is required.',
        ),
        expected: session,
      });

      const attemptEvent = await acceptAttemptEvent({
        repository,
        session,
        payload: await context.req.json(),
      });
      await repository.recordAuditEvent({
        eventType: 'attempt.submitted',
        actorType: 'system',
        actorId: null,
        deploymentRecordId: session.deploymentRecordId,
        packageVersionId: session.packageVersionId,
        attemptId: session.attemptId,
        lineItemBindingId: null,
        status: 'accepted',
        summary: 'Accepted attempt submission through the runtime gateway.',
        detail: {
          sequence: attemptEvent.sequence,
          eventType: attemptEvent.eventType,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.json({ accepted: true }, 202);
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.post('/runtime/sessions/:sessionId/finalize', async (context) => {
    try {
      const repository = services.getRepository();
      const session = await requireRuntimeSession(repository, context.req.param('sessionId'));

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header('authorization')),
          'Runtime session token is required.',
        ),
        expected: session,
      });

      const result = await finalizeRuntimeAttempt({
        repository,
        session,
        payload: await context.req.json(),
      });

      if (result.finalizedNow) {
        await repository.recordAuditEvent({
          eventType: 'attempt.finalized',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: session.deploymentRecordId,
          packageVersionId: session.packageVersionId,
          attemptId: session.attemptId,
          lineItemBindingId: null,
          status: 'accepted',
          summary: 'Finalized the durable attempt inside the runtime gateway.',
          detail: {
            completionState: result.attempt.completionState,
            scoreGiven: result.score.scoreGiven,
            scoreMaximum: result.score.scoreMaximum,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      if (result.gradePublishedNow && result.gradePublication !== null) {
        await repository.recordAuditEvent({
          eventType: 'grade_publish.succeeded',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: session.deploymentRecordId,
          packageVersionId: session.packageVersionId,
          attemptId: session.attemptId,
          lineItemBindingId: result.lineItemBinding?.id ?? null,
          status: 'succeeded',
          summary: 'Published the final score to Canvas through AGS.',
          detail: {
            lineItemUrl: result.gradePublication.lineItemUrl,
            scoreGiven: result.gradePublication.scoreGiven,
            scoreMaximum: result.gradePublication.scoreMaximum,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      if (result.publishError !== null) {
        await repository.recordAuditEvent({
          eventType: 'grade_publish.failed',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: session.deploymentRecordId,
          packageVersionId: session.packageVersionId,
          attemptId: session.attemptId,
          lineItemBindingId: result.lineItemBinding?.id ?? null,
          status: 'failed',
          summary: 'Canvas AGS score publish failed.',
          detail: {
            code: result.publishError.code,
            message: result.publishError.message,
            ...result.publishError.detail,
          },
          occurredAt: new Date().toISOString(),
        });

        return context.text(
          result.publishError.message,
          statusForFinalizePublishError(result.publishError.code),
        );
      }

      return context.json(
        {
          accepted: true,
          alreadyFinalized: !result.finalizedNow,
          attemptId: result.attempt.attemptId,
          completionState: result.attempt.completionState,
          scoreGiven: result.score.scoreGiven,
          scoreMaximum: result.score.scoreMaximum,
          gradePublished: result.gradePublication?.status === 'published',
        },
        202,
      );
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get('/runtime/sessions/:sessionId/files/*', async (context) => {
    try {
      const repository = services.getRepository();
      const session = await requireRuntimeSession(repository, context.req.param('sessionId'));
      const fileRequest = readRuntimeFileRequest(context);

      authorizeRuntimeSession({
        token: fileRequest.token,
        expected: session,
      });

      const relativePath = fileRequest.relativePath;
      const contentType = contentTypeForRuntimePath(relativePath);
      const assetBytes = await loadRuntimeAssetBytes(session, relativePath);
      const assetBody = new Uint8Array(assetBytes.byteLength);

      assetBody.set(assetBytes);

      return new Response(new Blob([assetBody], { type: contentType }), {
        status: 200,
        headers: {
          'content-type': contentType,
        },
      });
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });
}
