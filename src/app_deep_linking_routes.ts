import type { Hono } from '@hono/hono';
import { renderDeepLinkingPickerResponse } from './app_deep_linking_views.ts';
import {
  normalizeOptionalString,
  requireTrimmedFormValue,
  requireTrimmedString,
} from './app_request_support.ts';
import {
  errorMessage,
  statusForDeepLinkingError,
  statusForDeepLinkingSessionError,
} from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import {
  createDeepLinkingSession,
  requireAuthorizedDeepLinkingSession,
  saveDeepLinkingSessionSelection,
  validateDeepLinkingRequest,
} from './lti/deep_linking.ts';

export function registerDeepLinkingRoutes(app: Hono, services: AppServices): void {
  app.post('/lti/deep-linking', async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();
    const state = normalizeOptionalString(formData.get('state'));
    const idToken = normalizeOptionalString(formData.get('id_token'));

    try {
      const request = await validateDeepLinkingRequest({
        repository,
        state: requireTrimmedString(state, 'Deep Linking state is required.'),
        idToken: requireTrimmedString(idToken, 'Deep Linking id_token is required.'),
        loadJwks: services.loadCanvasJwks,
      });
      const session = await createDeepLinkingSession({
        repository,
        request,
      });
      const deployment = await repository.getDeploymentBySlug(request.internalDeploymentSlug);
      await repository.recordAuditEvent({
        eventType: 'deep_linking.request.accepted',
        actorType: 'platform',
        actorId: request.userId,
        deploymentRecordId: request.internalDeploymentId,
        packageVersionId: deployment?.enabledPackageVersionId ?? null,
        attemptId: null,
        lineItemBindingId: null,
        status: 'accepted',
        summary: 'Accepted an assignment-selection Deep Linking request.',
        detail: {
          deepLinkingSessionId: session.sessionId,
          internalDeploymentSlug: request.internalDeploymentSlug,
          issuer: request.issuer,
          clientId: request.clientId,
          deploymentId: request.deploymentId,
          contextId: request.contextId,
          placement: request.placement,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/lti/deep-linking/sessions/${session.sessionId}?token=${encodeURIComponent(
          session.sessionToken,
        )}`,
        303,
      );
    } catch (error) {
      return context.text(errorMessage(error), statusForDeepLinkingError(error));
    }
  });

  app.get('/lti/deep-linking/sessions/:sessionId', async (context) => {
    try {
      const repository = services.getRepository();
      const url = new URL(context.req.url);
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param('sessionId'),
        token: requireTrimmedString(
          url.searchParams.get('token'),
          'Deep Linking session token is required.',
        ),
      });

      return await renderDeepLinkingPickerResponse({
        context,
        repository,
        session,
        token: session.sessionToken,
        notice: null,
      });
    } catch (error) {
      return context.text(errorMessage(error), statusForDeepLinkingSessionError(error));
    }
  });

  app.post('/lti/deep-linking/sessions/:sessionId', async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();

    try {
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param('sessionId'),
        token: requireTrimmedFormValue(
          formData.get('token'),
          'Deep Linking session token is required.',
        ),
      });

      try {
        const saved = await saveDeepLinkingSessionSelection({
          repository,
          session,
          selectionValue: requireTrimmedFormValue(
            formData.get('selection'),
            'Choose one reviewed resource before continuing.',
          ),
        });

        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session: saved.session,
          token: session.sessionToken,
          notice: {
            tone: 'success',
            title: 'Selection saved',
            detail:
              'Lantern saved the reviewed version and content path. Phase 6 will return this selection to Canvas.',
          },
        });
      } catch (error) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token: session.sessionToken,
          notice: {
            tone: 'error',
            title: 'Selection blocked',
            detail: errorMessage(error),
          },
          status: 400,
        });
      }
    } catch (error) {
      return context.text(errorMessage(error), statusForDeepLinkingSessionError(error));
    }
  });
}
