import type { Hono } from '@hono/hono';
import { getManagedDeploymentSlot } from './admin/deployment_detail.ts';
import { renderDynamicRegistrationStatusPage } from './app_dynamic_registration_views.ts';
import { loadDeploymentDetailState } from './app_deployment_support.ts';
import {
  buildBindingAuditDetail,
  normalizeOptionalQueryValue,
  requireTrimmedQueryValue,
} from './app_admin_deployment_detail_route_support.ts';
import { completeCanvasDynamicRegistration } from './lti/canvas_dynamic_registration.ts';
import { completeMoodleDynamicRegistration } from './lti/moodle_dynamic_registration.ts';
import { completeSakaiDynamicRegistration } from './lti/sakai_dynamic_registration.ts';
import { errorMessage, statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';

export function registerAdminDeploymentDynamicRegistrationRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.get('/admin/packages/:appId/deployment/register/canvas', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const detail = await loadDeploymentDetailState(repository, appId);
      const searchParams = new URL(context.req.url).searchParams;
      const openidConfigurationUrl = requireTrimmedQueryValue(
        searchParams.get('openid_configuration'),
        'Canvas openid_configuration is required.',
      );
      const registrationToken = requireTrimmedQueryValue(
        searchParams.get('registration_token'),
        'Canvas registration_token is required.',
      );
      const slot = getManagedDeploymentSlot(detail.slots, 'canvas');
      const registration = await completeCanvasDynamicRegistration({
        appTitle: detail.appTitle,
        openidConfigurationUrl,
        registrationToken,
      });
      const deployment = await repository.saveCanvasRegistration({
        slug: slot.deployment.slug,
        label: slot.deployment.label,
        appId,
        canvasEnvironment: registration.canvasEnvironment,
        issuer: registration.issuer,
        clientId: registration.clientId,
      });

      await repository.recordAuditEvent({
        eventType: 'deployment.binding_saved',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: deployment.id,
        packageVersionId: deployment.enabledPackageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: 'succeeded',
        summary:
          'Saved the Canvas registration and queued the exact deployment binding for the first launch.',
        detail: {
          lms: 'canvas',
          deploymentSlug: deployment.slug,
          registrationMode: 'dynamic',
          canvasEnvironment: registration.canvasEnvironment,
          issuer: registration.issuer,
          clientId: registration.clientId,
          deploymentId: null,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.html(
        renderDynamicRegistrationStatusPage({
          tone: 'success',
          title: 'Canvas registration saved',
          detail:
            'Lantern saved the Canvas environment and Client ID. Finish the tool enablement in Canvas, then launch it once so Lantern can capture the exact deployment ID automatically.',
          closeLabel: 'Close and return to Canvas',
          returnUrl: `/admin/packages/${appId}/deployment?lms=canvas&registered=canvas#slot-panel`,
          returnLabel: 'Open Lantern deployment detail',
        }),
      );
    } catch (error) {
      return context.html(
        renderDynamicRegistrationStatusPage({
          tone: 'error',
          title: 'Canvas dynamic registration blocked',
          detail: errorMessage(error),
          closeLabel: 'Close and return to Canvas',
          returnUrl: `/admin/packages/${appId}/deployment?lms=canvas#slot-panel`,
          returnLabel: 'Open Lantern deployment detail',
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/:appId/deployment/register/moodle', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const detail = await loadDeploymentDetailState(repository, appId);
      const searchParams = new URL(context.req.url).searchParams;
      const openidConfigurationUrl = requireTrimmedQueryValue(
        searchParams.get('openid_configuration'),
        'Moodle openid_configuration is required.',
      );
      const registrationToken = normalizeOptionalQueryValue(searchParams.get('registration_token'));
      const slot = getManagedDeploymentSlot(detail.slots, 'moodle');
      const binding = await completeMoodleDynamicRegistration({
        appTitle: detail.appTitle,
        openidConfigurationUrl,
        registrationToken,
      });
      const deployment = await repository.saveDeploymentBinding({
        slug: slot.deployment.slug,
        label: slot.deployment.label,
        appId,
        binding,
      });

      await repository.recordAuditEvent({
        eventType: 'deployment.binding_saved',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: deployment.id,
        packageVersionId: deployment.enabledPackageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Saved the Moodle deployment binding through dynamic registration.',
        detail: {
          deploymentSlug: deployment.slug,
          registrationMode: 'dynamic',
          ...buildBindingAuditDetail(binding),
        },
        occurredAt: new Date().toISOString(),
      });

      return context.html(
        renderDynamicRegistrationStatusPage({
          tone: 'success',
          title: 'Moodle binding saved',
          detail:
            'Lantern completed the Moodle dynamic registration flow and saved the exact Moodle deployment binding.',
          closeLabel: 'Close and return to Moodle',
          returnUrl: `/admin/packages/${appId}/deployment?lms=moodle#slot-panel`,
          returnLabel: 'Open Lantern deployment detail',
        }),
      );
    } catch (error) {
      return context.html(
        renderDynamicRegistrationStatusPage({
          tone: 'error',
          title: 'Moodle dynamic registration blocked',
          detail: errorMessage(error),
          closeLabel: 'Close and return to Moodle',
          returnUrl: `/admin/packages/${appId}/deployment?lms=moodle#slot-panel`,
          returnLabel: 'Open Lantern deployment detail',
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/packages/:appId/deployment/register/sakai', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const detail = await loadDeploymentDetailState(repository, appId);
      const searchParams = new URL(context.req.url).searchParams;
      const openidConfigurationUrl = requireTrimmedQueryValue(
        searchParams.get('openid_configuration'),
        'Sakai openid_configuration is required.',
      );
      const registrationToken = requireTrimmedQueryValue(
        searchParams.get('registration_token'),
        'Sakai registration_token is required.',
      );
      const slot = getManagedDeploymentSlot(detail.slots, 'sakai');
      const binding = await completeSakaiDynamicRegistration({
        appId,
        appTitle: detail.appTitle,
        openidConfigurationUrl,
        registrationToken,
      });
      const deployment = await repository.saveDeploymentBinding({
        slug: slot.deployment.slug,
        label: slot.deployment.label,
        appId,
        binding,
      });

      await repository.recordAuditEvent({
        eventType: 'deployment.binding_saved',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: deployment.id,
        packageVersionId: deployment.enabledPackageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Saved the Sakai deployment binding through dynamic registration.',
        detail: {
          deploymentSlug: deployment.slug,
          registrationMode: 'dynamic',
          ...buildBindingAuditDetail(binding),
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/admin/packages/${appId}/deployment?lms=sakai&registered=sakai#slot-panel`,
        303,
      );
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(
          context,
          services,
          appId,
          'Sakai dynamic registration blocked',
          error,
          {
            selectedLms: 'sakai',
          },
        ),
      );
    }
  });
}
