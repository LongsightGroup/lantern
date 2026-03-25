import type { Context, Hono } from '@hono/hono';
import {
  renderDeepLinkingPickerResponse,
  renderDeepLinkingSubmitStatusPage,
} from './app_deep_linking_views.ts';
import { normalizeOptionalString } from './app_request_support.ts';
import { deepLinkingReturnErrorMessage } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { buildDeepLinkingResponseSubmission } from './lti/deep_linking_response.ts';
import {
  authorizeDeepLinkingSession,
  createReviewedPlacementFromDeepLinkingSession,
  listDeepLinkingResources,
  resolveDeepLinkingSelection,
} from './lti/deep_linking.ts';

const sessionVerificationFailureDetail =
  'Lantern could not verify this Deep Linking session. Reopen the assignment picker from Canvas and try again.';

export function registerDeepLinkingSubmitRoutes(app: Hono, services: AppServices): void {
  app.post('/lti/deep-linking/sessions/:sessionId/submit', async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();
    const sessionId = context.req.param('sessionId');
    const token = normalizeOptionalString(formData.get('token'));
    const session = await repository.getDeepLinkingSessionById(sessionId);

    if (session === null) {
      return renderSessionVerificationFailure(context, 404);
    }

    if (token === null) {
      return renderSessionVerificationFailure(context, 409);
    }

    try {
      authorizeDeepLinkingSession({
        token,
        expected: session,
      });
    } catch {
      return renderSessionVerificationFailure(context, 409);
    }

    try {
      const selection = resolveDeepLinkingSelection({
        session,
        resources: await listDeepLinkingResources({
          repository,
          session,
        }),
      });

      if (selection === null) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token,
          notice: {
            tone: 'error',
            title: 'Return blocked',
            detail: 'Save one reviewed selection before returning to Canvas.',
          },
          status: 409,
        });
      }

      const deployment = await repository.getDeploymentBySlug(session.deploymentSlug);

      if (deployment === null || deployment.id !== session.deploymentRecordId) {
        throw new Error(
          `Canvas deployment ${session.deploymentSlug} could not be loaded for this Deep Linking session.`,
        );
      }

      const packageVersion = await repository.getPackageVersionById(selection.packageVersionId);

      if (packageVersion === null) {
        throw new Error(
          `Reviewed package version ${selection.packageVersionId} could not be loaded for the Canvas return.`,
        );
      }

      const { placement } = await createReviewedPlacementFromDeepLinkingSession({
        repository,
        session,
      });
      await repository.recordAuditEvent({
        eventType: 'deep_linking.placement.created',
        actorType: 'platform',
        actorId: session.userId,
        deploymentRecordId: session.deploymentRecordId,
        packageVersionId: placement.packageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Created a reviewed placement for Deep Linking return.',
        detail: {
          deepLinkingSessionId: session.sessionId,
          placementId: placement.placementId,
          contentPath: placement.contentPath,
          activityId: placement.activityId,
          contextId: placement.contextId,
        },
        occurredAt: new Date().toISOString(),
      });
      const submission = await buildDeepLinkingResponseSubmission({
        session,
        deployment,
        placement,
        packageVersion,
      });

      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: 'success',
          title: 'Returning to Canvas',
          detail:
            'Lantern created the reviewed placement and is posting the signed Deep Linking response back to Canvas.',
          session,
          selection,
          submission,
        }),
      );
    } catch (error) {
      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: 'error',
          title: 'Canvas return failed',
          detail: deepLinkingReturnErrorMessage(error),
          session,
          selection: resolveDeepLinkingSelection({
            session,
            resources: await listDeepLinkingResources({
              repository,
              session,
            }),
          }),
        }),
        500,
      );
    }
  });
}

function renderSessionVerificationFailure(context: Context, status: 404 | 409) {
  return context.html(
    renderDeepLinkingSubmitStatusPage({
      tone: 'error',
      title: 'Session verification failed',
      detail: sessionVerificationFailureDetail,
    }),
    status,
  );
}
