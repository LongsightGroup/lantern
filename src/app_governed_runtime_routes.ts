/**
 * Governed LMS runtime delivery plane.
 *
 * These routes serve `governed_runtime_sessions` minted by `lms_kernel` from an
 * authorized LMS launch (see `src/lms_kernel/launch_service.ts`). This is the
 * only runtime plane that may serve reviewed Worker apps launched from an LMS.
 * Preview/authoring runs use the separate plane in `src/app_runtime_routes.ts`.
 */
import type { Hono } from '@hono/hono';
import type { AppServices } from './app_services.ts';

type GovernedRuntimeRouteServices = Pick<
  AppServices,
  'getLmsKernelRepository' | 'getRepository' | 'runtimeDelivery'
>;
import {
  buildReviewedWorkerRequest,
  sanitizeReviewedWorkerResponse,
} from './runtime/reviewed_worker_http.ts';
import type { GovernedRuntimeSession } from './lms_kernel/types.ts';
import { runtimeResponseEvent } from './lms_kernel/governance_events.ts';

export function registerGovernedRuntimeRoutes(
  app: Hono,
  services: GovernedRuntimeRouteServices,
): void {
  app.get('/governed/sessions/:sessionId', async (context) => {
    const token = new URL(context.req.url).searchParams.get('token')?.trim() ?? '';
    const repository = services.getLmsKernelRepository();
    const session = token === '' ? null : await repository.getGovernedRuntimeSession({
      runtimeSessionId: context.req.param('sessionId'),
      runtimeSessionToken: token,
    });
    if (session === null || !isRunnableSession(session, new Date())) {
      return appUnavailable('This governed app session is unavailable.', 401);
    }
    const traceId = session.launchTraceId;

    const packageVersion = await services.getRepository().getPackageVersionById(
      session.packageVersionId,
    );
    if (
      packageVersion === null ||
      packageVersion.approvalStatus !== 'approved' ||
      packageVersion.runtime.kind !== 'worker' ||
      packageVersion.appId !== session.appId ||
      packageVersion.version !== session.packageVersion ||
      !sameCapabilities(packageVersion.capabilities, session.packageCapabilities)
    ) {
      await recordLaunchEvent(repository, session, traceId, 'failed', 'package_mismatch');
      return appUnavailable('This governed app package is unavailable.', 409);
    }

    try {
      const response = sanitizeReviewedWorkerResponse(
        await services.runtimeDelivery.invokeReviewedWorker({
          session: { snapshotRoot: packageVersion.artifact.snapshotRoot },
          reviewedPackage: packageVersion,
          request: buildReviewedWorkerRequest(
            context,
            {
              sessionId: session.runtimeSessionId,
              sessionToken: session.runtimeSessionToken,
            },
            traceId,
          ),
        }),
        session.lmsOrigin,
      );
      response.headers.set('x-lantern-trace-id', traceId);
      await recordLaunchEvent(repository, session, traceId, 'completed', null);
      return response;
    } catch {
      await recordLaunchEvent(repository, session, traceId, 'limited', 'app_unavailable');
      return appUnavailable(
        'This governed app is temporarily unavailable. Try again or share the trace ID with an administrator.',
        503,
        traceId,
      );
    }
  });
}

function isRunnableSession(session: GovernedRuntimeSession, now: Date): boolean {
  return Date.parse(session.runtimeExpiresAt) > now.getTime() &&
    session.institutionStatus === 'active' &&
    session.connectionStatus === 'active' &&
    session.installationStatus === 'active';
}

function sameCapabilities(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

async function recordLaunchEvent(
  repository: ReturnType<AppServices['getLmsKernelRepository']>,
  session: GovernedRuntimeSession,
  traceId: string,
  outcome: 'completed' | 'failed' | 'limited',
  errorCode: string | null,
): Promise<void> {
  await repository.appendGovernanceEvent(runtimeResponseEvent({
    traceId,
    institutionId: session.institutionId,
    lmsConnectionId: session.lmsConnectionId,
    lmsContextId: session.lmsContextId,
    appInstallationId: session.appInstallationId,
    appId: session.appId,
    packageVersionId: session.packageVersionId,
    runtimeSessionId: session.runtimeSessionId,
    actorType: session.actorType,
    actorId: session.actorSubjectId,
    outcome,
    connectorKind: session.connectorKind,
    errorCode,
    occurredAt: new Date().toISOString(),
  }));
}

function appUnavailable(
  message: string,
  status: 401 | 409 | 503,
  traceId?: string,
): Response {
  const trace = traceId === undefined ? '' : `<p>Trace: <code>${escapeHtml(traceId)}</code></p>`;
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>App unavailable</title><body><main><h1>App unavailable</h1><p>${
      escapeHtml(message)
    }</p>${trace}</main></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
        ...(traceId === undefined ? {} : { 'x-lantern-trace-id': traceId }),
      },
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
