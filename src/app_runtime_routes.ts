import type { Context, Hono } from '@hono/hono';
import type { RuntimeSessionRecord } from './lti/types.ts';
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
import {
  recordRuntimeCapabilityAllowed,
  recordRuntimeRouteFailure,
  recordRuntimeScoreProposalAccepted,
  recordRuntimeSessionExited,
  recordRuntimeSessionStarted,
  requireRuntimeSession,
  resolveRuntimeSessionForAudit,
} from './app_runtime_support.ts';
import {
  acceptAttemptEvent,
  finalizeRuntimeAttempt,
  readAttemptLocalState,
  submitEvidenceArtifact,
  submitScoreProposal,
  writeAttemptLocalState,
} from './runtime/gateway.ts';
import { failRuntimeOutcome, toRuntimeBrokerResult } from './runtime/gateway_errors.ts';
import type { RuntimeDeliveryDescriptor } from './runtime/delivery.ts';
import {
  authorizeRuntimeSession,
  loadRuntimeActivityContent,
  renderRuntimeSessionPage,
} from './runtime/session.ts';
import type { PackageVersionRecord } from './package_review/types.ts';
import { readEnv } from './platform/env.ts';
import { buildRequestAuditEnvelope, type RequestAuditEnvelope } from './request_audit.ts';
import { requireRuntimeRequestOrigin } from './runtime_origin.ts';

export function registerRuntimeRoutes(app: Hono, services: AppServices): void {
  app.get('/runtime/sessions/:sessionId', async (context) => {
    return await withRuntimeRoute(context, services, 'session', 'text', async (runtime) => {
      const url = new URL(context.req.url);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          url.searchParams.get('token'),
          'Runtime session token is required.',
        ),
        expected: runtime.session,
      });
      const reviewedPackage = await runtime.repository.getPackageVersionById(
        runtime.session.packageVersionId,
      );

      if (!reviewedPackage) {
        failRuntimeOutcome({
          type: 'integrity_failure',
          code: 'package_version_missing',
          message: `Runtime session package version id ${runtime.session.packageVersionId} was not found.`,
          status: 409,
          detail: {
            packageVersionId: runtime.session.packageVersionId,
          },
        });
      }
      runtime.setReviewedPackage(reviewedPackage);

      if (reviewedPackage.approvalStatus !== 'approved') {
        failRuntimeOutcome({
          type: 'integrity_failure',
          code: 'package_version_not_approved',
          message: `Runtime session package version ${reviewedPackage.appId}@${reviewedPackage.version} is not approved.`,
          status: 409,
          detail: {
            packageVersionId: reviewedPackage.id,
          },
        });
      }
      runtime.setDeliveryForReviewedPackage(reviewedPackage);

      const response = context.html(
        await renderRuntimeSessionPage(runtime.session, {
          env: services.env,
          runtimeDelivery: services.runtimeDelivery,
          reviewedPackage,
        }),
      );

      applyRuntimeDocumentHeaders(response.headers);
      await recordRuntimeSessionStarted({
        repository: runtime.repository,
        session: runtime.session,
        runtimeOrigin: runtime.runtimeOrigin,
        reviewedPackage,
        delivery: runtime.delivery,
        route: 'session',
      });
      return response;
    });
  });

  app.get('/runtime/sessions/:sessionId/content', async (context) => {
    return await withRuntimeRoute(context, services, 'content', 'text', async (runtime) => {
      authorizeRuntimeBearerToken(context, runtime.session);

      const content = await loadRuntimeActivityContent(
        runtime.session,
        services.runtimeArtifactStore,
      );

      if (runtime.session.preview !== undefined) {
        await runtime.repository.appendPreviewEvidence({
          previewSessionId: runtime.session.preview.previewSessionId,
          eventType: 'preview.content_read',
          capability: 'read_activity_content',
          summary: 'Loaded the app content for this test launch.',
          detail: {
            attemptId: runtime.session.attemptId,
            contentPath: runtime.session.contentPath,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      return context.json(content);
    });
  });

  app.get('/runtime/sessions/:sessionId/local-state', async (context) => {
    return await withRuntimeRoute(
      context,
      services,
      'local-state.read',
      'text',
      async (runtime) => {
        authorizeRuntimeBearerToken(context, runtime.session);

        return context.json(
          await readAttemptLocalState({
            repository: runtime.repository,
            session: runtime.session,
          }),
        );
      },
    );
  });

  app.put('/runtime/sessions/:sessionId/local-state', async (context) => {
    return await withRuntimeRoute(
      context,
      services,
      'local-state.write',
      'mutation',
      async (runtime) => {
        authorizeRuntimeBearerToken(context, runtime.session);

        const payload = await context.req.json();
        runtime.setRequestBody(payload);
        await writeAttemptLocalState({
          repository: runtime.repository,
          session: runtime.session,
          payload,
        });

        return new Response(null, { status: 204 });
      },
    );
  });

  app.post('/runtime/sessions/:sessionId/attempt-events', async (context) => {
    return await withRuntimeRoute(
      context,
      services,
      'attempt-events',
      'mutation',
      async (runtime) => {
        authorizeRuntimeBearerToken(context, runtime.session);

        const payload = await context.req.json();
        runtime.setRequestBody(payload);
        const attemptEvent = await acceptAttemptEvent({
          repository: runtime.repository,
          session: runtime.session,
          payload,
        });
        await runtime.repository.recordAuditEvent({
          eventType: 'attempt.submitted',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: runtime.session.deploymentRecordId,
          packageVersionId: runtime.session.packageVersionId,
          attemptId: runtime.session.attemptId,
          lineItemBindingId: null,
          status: 'accepted',
          summary: 'Accepted attempt submission through the runtime gateway.',
          detail: {
            sequence: attemptEvent.sequence,
            eventType: attemptEvent.eventType,
          },
          occurredAt: new Date().toISOString(),
        });
        await recordRuntimeCapabilityAllowed({
          repository: runtime.repository,
          session: runtime.session,
          capability: 'submit_attempt_event',
          route: 'attempt-events',
          detail: {
            eventType: attemptEvent.eventType,
            sequence: attemptEvent.sequence,
          },
        });

        return context.json({ accepted: true }, 202);
      },
    );
  });

  app.post('/runtime/sessions/:sessionId/evidence-artifacts', async (context) => {
    return await withRuntimeRoute(
      context,
      services,
      'evidence-artifacts',
      'mutation',
      async (runtime) => {
        authorizeRuntimeBearerToken(context, runtime.session);

        const payload = await context.req.json();
        runtime.setRequestBody(payload);
        const result = await submitEvidenceArtifact({
          repository: runtime.repository,
          session: runtime.session,
          payload,
          evidenceArtifactStore: services.evidenceArtifactStore,
        });

        await recordRuntimeCapabilityAllowed({
          repository: runtime.repository,
          session: runtime.session,
          capability: 'submit_evidence_artifact',
          route: 'evidence-artifacts',
          detail: {
            artifactId: result.artifactId,
          },
        });

        return context.json(result, 202);
      },
    );
  });

  app.post('/runtime/sessions/:sessionId/score-proposal', async (context) => {
    return await withRuntimeRoute(
      context,
      services,
      'score-proposal',
      'mutation',
      async (runtime) => {
        authorizeRuntimeBearerToken(context, runtime.session);

        const payload = await context.req.json();
        runtime.setRequestBody(payload);
        const result = await submitScoreProposal({
          repository: runtime.repository,
          session: runtime.session,
          payload,
        });

        if (!result.accepted) {
          return context.json(result, result.denial.category === 'policyDenied' ? 409 : 400);
        }

        await recordRuntimeScoreProposalAccepted({
          repository: runtime.repository,
          session: runtime.session,
          scoreProposal: result.scoreProposal,
          route: 'score-proposal',
        });

        return context.json(result, 202);
      },
    );
  });

  app.post('/runtime/sessions/:sessionId/finalize', async (context) => {
    return await withRuntimeRoute(context, services, 'finalize', 'mutation', async (runtime) => {
      authorizeRuntimeBearerToken(context, runtime.session);
      const reviewedPackage = await runtime.repository.getPackageVersionById(
        runtime.session.packageVersionId,
      );
      if (reviewedPackage !== null) {
        runtime.setReviewedPackage(reviewedPackage);
        runtime.setDeliveryForReviewedPackage(reviewedPackage);
      }

      const payload = await context.req.json();
      runtime.setRequestBody(payload);
      const result = await finalizeRuntimeAttempt({
        repository: runtime.repository,
        session: runtime.session,
        payload,
        env: services.env,
        artifactStore: services.runtimeArtifactStore,
      });

      if (result.finalizedNow) {
        await runtime.repository.recordAuditEvent({
          eventType: 'attempt.finalized',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: runtime.session.deploymentRecordId,
          packageVersionId: runtime.session.packageVersionId,
          attemptId: runtime.session.attemptId,
          lineItemBindingId: null,
          status: 'accepted',
          summary: 'Finalized the durable attempt inside the runtime gateway.',
          detail: buildFinalizeAuditDetail(result),
          occurredAt: new Date().toISOString(),
        });
        await recordRuntimeSessionExited({
          repository: runtime.repository,
          session: runtime.session,
          reviewedPackage,
          delivery: runtime.delivery,
          completionState: result.attempt.completionState,
          scoreGiven: result.score.scoreGiven,
          scoreMaximum: result.score.scoreMaximum,
          gradePublished: result.gradePublication?.status === 'published',
          submissionMode: result.submissionMode,
          evidenceArtifactCount: result.evidenceArtifacts.length,
          evidenceArtifacts: result.evidenceArtifacts,
          browserGraderResult: result.browserGraderResult,
          route: 'finalize',
        });
      }

      if (result.gradePublishedNow && result.gradePublication !== null) {
        await runtime.repository.recordAuditEvent({
          eventType: 'grade_publish.succeeded',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: runtime.session.deploymentRecordId,
          packageVersionId: runtime.session.packageVersionId,
          attemptId: runtime.session.attemptId,
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
        await runtime.repository.recordAuditEvent({
          eventType: 'grade_publish.failed',
          actorType: 'system',
          actorId: null,
          deploymentRecordId: runtime.session.deploymentRecordId,
          packageVersionId: runtime.session.packageVersionId,
          attemptId: runtime.session.attemptId,
          lineItemBindingId: result.lineItemBinding?.id ?? null,
          status: 'failed',
          summary: 'Canvas AGS score publish failed.',
          detail: {
            code: result.publishError.code,
            message: result.publishError.message,
            request: runtime.request,
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
    });
  });

  app.get('/runtime/sessions/:sessionId/files/*', async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param('sessionId');
    let session: RuntimeSessionRecord | null = null;
    let reviewedPackage: PackageVersionRecord | null = null;
    let delivery = defaultRuntimeDeliveryDescriptor(services);
    const request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);
      const fileRequest = readRuntimeFileRequest(context);
      const approvedPackage = await requireApprovedRuntimePackageVersion(repository, session);
      reviewedPackage = approvedPackage;
      delivery = services.runtimeDelivery.describeDelivery({
        session,
        reviewedPackage: approvedPackage,
      });

      authorizeRuntimeSession({
        token: fileRequest.token,
        expected: session,
      });

      return buildRuntimeAssetResponse(
        await services.runtimeDelivery.loadReviewedAsset({
          session,
          reviewedPackage: approvedPackage,
          relativePath: fileRequest.relativePath,
        }),
      );
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(repository, session, sessionId);
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        delivery,
        reviewedPackage,
        route: 'files',
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get('/runtime/sessions/:sessionId/browser-grader/*', async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param('sessionId');
    let session: RuntimeSessionRecord | null = null;
    let reviewedPackage: PackageVersionRecord | null = null;
    let delivery = defaultRuntimeDeliveryDescriptor(services);
    const request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);
      const url = new URL(context.req.url);
      const token =
        readBearerToken(context.req.header('authorization')) ?? url.searchParams.get('token');

      authorizeRuntimeSession({
        token: requireTrimmedString(token, 'Runtime session token is required.'),
        expected: session,
      });

      const approvedPackage = await requireApprovedRuntimePackageVersion(repository, session);
      reviewedPackage = approvedPackage;
      delivery = services.runtimeDelivery.describeDelivery({
        session,
        reviewedPackage: approvedPackage,
      });
      const assetPath = url.pathname.slice(
        `/runtime/sessions/${encodeURIComponent(sessionId)}/browser-grader/`.length,
      );
      const asset = await services.runtimeDelivery.loadBrowserGraderAsset({
        session,
        reviewedPackage: approvedPackage,
        assetPath,
      });

      if (asset === null) {
        return context.text('Browser grader is not configured for this reviewed package.', 404);
      }

      return buildRuntimeAssetResponse(asset);
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(repository, session, sessionId);
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        delivery,
        reviewedPackage,
        route: 'browser-grader',
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });
}

interface RuntimeRouteContext {
  repository: ReturnType<AppServices['getRepository']>;
  runtimeOrigin: string;
  session: RuntimeSessionRecord;
  request: RequestAuditEnvelope;
  delivery: RuntimeDeliveryDescriptor;
  setRequestBody(body: unknown): void;
  setReviewedPackage(reviewedPackage: PackageVersionRecord | null): void;
  setDeliveryForReviewedPackage(reviewedPackage: PackageVersionRecord): void;
}

async function withRuntimeRoute(
  context: Context,
  services: AppServices,
  route: string,
  errorResponse: 'text' | 'mutation',
  handler: (runtime: RuntimeRouteContext) => Promise<Response>,
): Promise<Response> {
  const repository = services.getRepository();
  const sessionId = requireTrimmedString(
    context.req.param('sessionId') ?? null,
    'Runtime session id is required.',
  );
  let session: RuntimeSessionRecord | null = null;
  let reviewedPackage: PackageVersionRecord | null = null;
  let delivery = defaultRuntimeDeliveryDescriptor(services);
  let request = buildRequestAuditEnvelope({ context });

  try {
    const runtimeOrigin = requireRuntimeOriginBoundary(context, services);
    session = await requireRuntimeSession(repository, sessionId);
    const runtimeSession = session;

    return await handler({
      repository,
      runtimeOrigin,
      session: runtimeSession,
      get request() {
        return request;
      },
      get delivery() {
        return delivery;
      },
      setRequestBody(body) {
        request = buildRequestAuditEnvelope({ context, body });
      },
      setReviewedPackage(nextReviewedPackage) {
        reviewedPackage = nextReviewedPackage;
      },
      setDeliveryForReviewedPackage(nextReviewedPackage) {
        delivery = services.runtimeDelivery.describeDelivery({
          session: runtimeSession,
          reviewedPackage: nextReviewedPackage,
        });
      },
    });
  } catch (error) {
    session = await resolveRuntimeSessionForAudit(repository, session, sessionId);
    await recordRuntimeRouteFailure({
      repository,
      session,
      error,
      delivery,
      reviewedPackage,
      route,
      request,
    });

    if (errorResponse === 'mutation') {
      return runtimeMutationErrorResponse(context, error);
    }

    return context.text(errorMessage(error), statusForRuntimeError(error));
  }
}

function authorizeRuntimeBearerToken(context: Context, session: RuntimeSessionRecord): void {
  authorizeRuntimeSession({
    token: requireTrimmedString(
      readBearerToken(context.req.header('authorization')),
      'Runtime session token is required.',
    ),
    expected: session,
  });
}

function buildFinalizeAuditDetail(
  result: Awaited<ReturnType<typeof finalizeRuntimeAttempt>>,
): Record<string, unknown> {
  return {
    completionState: result.attempt.completionState,
    scoreGiven: result.score.scoreGiven,
    scoreMaximum: result.score.scoreMaximum,
    submissionMode: result.submissionMode,
    evidenceArtifactCount: result.evidenceArtifacts.length,
    evidenceArtifacts: result.evidenceArtifacts,
    ...(result.browserGraderResult === null
      ? {}
      : { browserGraderResult: result.browserGraderResult }),
  };
}

function requireRuntimeOriginBoundary(context: Context, services: AppServices): string {
  try {
    return requireRuntimeRequestOrigin({
      requestUrl: context.req.url,
      forwardedHeader: context.req.header('forwarded') ?? null,
      xForwardedHost: context.req.header('x-forwarded-host') ?? null,
      xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
      configuredOrigin: readEnv('APP_RUNTIME_ORIGIN', services.env),
    });
  } catch (error) {
    const message = errorMessage(error);

    if (message === 'APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions.') {
      failRuntimeOutcome({
        type: 'integrity_failure',
        code: 'runtime_origin_missing',
        message,
        status: 500,
        detail: {},
      });
    }

    if (message === 'APP_RUNTIME_ORIGIN must be an absolute http or https URL.') {
      failRuntimeOutcome({
        type: 'integrity_failure',
        code: 'runtime_origin_invalid',
        message,
        status: 500,
        detail: {},
      });
    }

    if (message === 'Runtime session requests must use APP_RUNTIME_ORIGIN.') {
      failRuntimeOutcome({
        type: 'deny',
        code: 'runtime_origin_mismatch',
        message,
        status: 409,
        detail: {},
      });
    }

    throw error;
  }
}

function runtimeMutationErrorResponse(context: Context, error: unknown): Response {
  const brokerResult = toRuntimeBrokerResult(error);

  if (brokerResult !== null) {
    return context.json(brokerResult, statusForRuntimeError(error));
  }

  return context.text(errorMessage(error), statusForRuntimeError(error));
}

function applyRuntimeDocumentHeaders(headers: Headers): void {
  applyRuntimeResponseHeaders(headers);
  headers.set('content-security-policy', runtimeContentSecurityPolicy());
  headers.set('permissions-policy', runtimePermissionsPolicy());
}

function buildRuntimeAssetHeaders(contentType: string): Headers {
  const headers = new Headers({
    'content-type': contentType,
  });

  applyRuntimeResponseHeaders(headers);
  return headers;
}

function buildRuntimeAssetResponse(asset: { bytes: Uint8Array; contentType: string }): Response {
  const body = new Uint8Array(asset.bytes.byteLength);

  body.set(asset.bytes);

  return new Response(new Blob([body], { type: asset.contentType }), {
    status: 200,
    headers: buildRuntimeAssetHeaders(asset.contentType),
  });
}

async function requireApprovedRuntimePackageVersion(
  repository: ReturnType<AppServices['getRepository']>,
  session: RuntimeSessionRecord,
): Promise<PackageVersionRecord> {
  const packageVersion = await repository.getPackageVersionById(session.packageVersionId);

  if (!packageVersion) {
    failRuntimeOutcome({
      type: 'integrity_failure',
      code: 'package_version_missing',
      message: `Runtime session package version id ${session.packageVersionId} was not found.`,
      status: 409,
      detail: {
        packageVersionId: session.packageVersionId,
      },
    });
  }

  if (packageVersion.approvalStatus !== 'approved') {
    failRuntimeOutcome({
      type: 'integrity_failure',
      code: 'package_version_not_approved',
      message: `Runtime session package version ${packageVersion.appId}@${packageVersion.version} is not approved.`,
      status: 409,
      detail: {
        packageVersionId: packageVersion.id,
      },
    });
  }

  return packageVersion;
}

function applyRuntimeResponseHeaders(headers: Headers): void {
  headers.set('cache-control', 'no-store');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
}

function runtimeContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com",
    "media-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "worker-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
}

function runtimePermissionsPolicy(): string {
  return [
    'accelerometer=()',
    'camera=()',
    'clipboard-read=()',
    'clipboard-write=()',
    'display-capture=()',
    'fullscreen=()',
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'payment=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'serial=()',
    'usb=()',
    'web-share=()',
    'xr-spatial-tracking=()',
  ].join(', ');
}

function defaultRuntimeDeliveryDescriptor(services: AppServices): RuntimeDeliveryDescriptor {
  return {
    substrate: services.runtimeDelivery.substrate,
    workerId: null,
  };
}
