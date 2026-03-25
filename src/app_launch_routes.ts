import type { Hono } from '@hono/hono';
import { createRuntimeSession, validateLaunchRequest } from './lti/launch.ts';
import { handleLoginInitiation, recordRejectedLaunchAudit } from './app_lti_support.ts';
import { normalizeOptionalString, requireTrimmedString } from './app_request_support.ts';
import { errorMessage, statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';

export function registerLaunchRoutes(app: Hono, services: AppServices): void {
  app.get('/lti/login', async (context) => {
    return await handleLoginInitiation(context, services);
  });

  app.post('/lti/login', async (context) => {
    return await handleLoginInitiation(context, services);
  });

  app.post('/lti/launch', async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();
    const state = normalizeOptionalString(formData.get('state'));
    const idToken = normalizeOptionalString(formData.get('id_token'));

    try {
      const launch = await validateLaunchRequest({
        repository,
        state: requireTrimmedString(state, 'Launch state is required.'),
        idToken: requireTrimmedString(idToken, 'Launch id_token is required.'),
        loadJwks: services.loadCanvasJwks,
      });
      const runtimeSession = await createRuntimeSession({
        repository,
        launch,
      });
      await repository.recordAuditEvent({
        eventType: 'launch.accepted',
        actorType: 'platform',
        actorId: launch.userId,
        deploymentRecordId: launch.internalDeploymentId,
        packageVersionId: launch.packageVersionId,
        attemptId: runtimeSession.attemptId,
        lineItemBindingId: null,
        status: 'accepted',
        summary: 'Accepted the governed Canvas launch.',
        detail: {
          internalDeploymentSlug: launch.internalDeploymentSlug,
          issuer: launch.issuer,
          clientId: launch.clientId,
          deploymentId: launch.deploymentId,
          resourceLinkId: launch.resourceLinkId,
          contextId: launch.contextId,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/runtime/sessions/${runtimeSession.sessionId}?token=${encodeURIComponent(
          runtimeSession.sessionToken,
        )}`,
        303,
      );
    } catch (error) {
      await recordRejectedLaunchAudit({
        repository,
        state,
        error,
      });
      return context.text(errorMessage(error), statusForError(error));
    }
  });
}
