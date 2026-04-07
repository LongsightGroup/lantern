import type { Hono } from '@hono/hono';
import {
  getSelectedManagedDeploymentSlot,
  renderDeploymentDetailPage,
} from './admin/deployment_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { loadDeploymentDetailState } from './app_deployment_support.ts';
import { registerAdminDeploymentDynamicRegistrationRoutes } from './app_admin_deployment_detail_registration_routes.ts';
import { registerAdminDeploymentFormRoutes } from './app_admin_deployment_detail_form_routes.ts';
import {
  buildDeploymentDetailNotice,
  parseOptionalManagedDeploymentLms,
} from './app_admin_deployment_detail_route_support.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { listCanvasEnvironments } from './lti/config.ts';
import type { AppServices } from './app_services.ts';
import { statusForError } from './app_status_support.ts';
import { readEnv } from './platform/env.ts';
import { resolveConfiguredPublicOrigin } from './public_origin.ts';

export function registerAdminDeploymentDetailRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/packages/:appId/deployment', async (context) => {
    try {
      const url = new URL(context.req.url);
      const selectedLms = parseOptionalManagedDeploymentLms(url.searchParams.get('lms'));
      const openOperationalEvidence = url.searchParams.get('view') === 'activity';
      const repository = services.getRepository();
      const appOrigin = resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header('forwarded') ?? null,
        xForwardedHost: context.req.header('x-forwarded-host') ?? null,
        xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
        configuredOrigin: readEnv('APP_ORIGIN', services.env),
      });
      const detail = await loadDeploymentDetailState(
        repository,
        context.req.param('appId'),
        appOrigin,
      );
      const viewedSlot = getSelectedManagedDeploymentSlot(detail.slots, selectedLms);
      const controlPlaneDetail = viewedSlot.persisted
        ? await services
            .getOpsRepository()
            .getControlPlaneDeploymentDetail(viewedSlot.deployment.id)
        : null;

      return context.html(
        renderDeploymentDetailPage({
          appId: context.req.param('appId'),
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          selectedLms,
          openOperationalEvidence,
          nrpsVerification: detail.nrpsVerification,
          lanternLtiProfileSettings: detail.ltiProfileSettings,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          canvasDynamicRegistrationUrl: detail.canvasDynamicRegistrationUrl,
          moodleDynamicRegistrationUrl: detail.moodleDynamicRegistrationUrl,
          sakaiDynamicRegistrationUrl: detail.sakaiDynamicRegistrationUrl,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: buildDeploymentDetailNotice(
            detail.canvasConfigUrl.notice,
            url.searchParams.get('registered'),
          ),
        }),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice('Connections page unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  registerAdminDeploymentDynamicRegistrationRoutes(app, services);
  registerAdminDeploymentFormRoutes(app, services);
}
