import type { Hono } from '@hono/hono';
import {
  buildDefaultDeploymentSeed,
  renderDeploymentDetailPage,
} from './admin/deployment_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { loadDeploymentDetailState } from './app_deployment_support.ts';
import { createErrorNotice } from './app_notice_support.ts';
import {
  buildCanvasConfigUrl,
  listCanvasEnvironments,
  parseCanvasEnvironment,
  resolveCanvasIssuer,
} from './lti/config.ts';
import { requireTrimmedFormValue } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';

export function registerAdminDeploymentDetailRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/packages/:appId/deployment', async (context) => {
    try {
      const repository = services.getRepository();
      const detail = await loadDeploymentDetailState(repository, context.req.param('appId'));
      const controlPlaneDetail =
        detail.primaryDeployment === null
          ? null
          : await services
              .getOpsRepository()
              .getControlPlaneDeploymentDetail(detail.primaryDeployment.id);

      return context.html(
        renderDeploymentDetailPage({
          appId: context.req.param('appId'),
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          nrpsVerification: detail.nrpsVerification,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: detail.canvasConfigUrl.notice,
        }),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice('Deployment page unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.post('/admin/packages/:appId/deployment/pin', async (context) => {
    const appId = context.req.param('appId');

    try {
      const repository = services.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: 'Version picker unavailable',
              detail: 'Import the app package before you attempt to save a deployment pin.',
            },
          }),
          404,
        );
      }

      const formData = await context.req.formData();
      const selectedId = Number(formData.get('packageVersionId'));
      const appTitle = history[0]?.title ?? history[0]?.appId ?? 'Package';
      const seed = buildDefaultDeploymentSeed(appId, appTitle);

      const deployment = await repository.pinDeploymentVersion({
        slug: seed.slug,
        label: seed.label,
        appId,
        packageVersionId: selectedId,
      });
      await repository.recordAuditEvent({
        eventType: 'deployment.version_pinned',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: deployment.id,
        packageVersionId: deployment.enabledPackageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: 'succeeded',
        summary: 'Pinned an exact reviewed package version for deployment.',
        detail: {
          deploymentSlug: deployment.slug,
          packageVersionId: deployment.enabledPackageVersionId,
          packageVersion: deployment.enabledPackageVersion,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(context, services, appId, 'Version pin blocked', error),
      );
    }
  });

  app.post('/admin/packages/:appId/deployment/install', async (context) => {
    const appId = context.req.param('appId');

    try {
      buildCanvasConfigUrl();

      const repository = services.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: 'Canvas install unavailable',
              detail: 'Import the app package before you attempt to save the Canvas binding.',
            },
          }),
          404,
        );
      }

      const formData = await context.req.formData();
      const appTitle = history[0]?.title ?? history[0]?.appId ?? 'Package';
      const seed = buildDefaultDeploymentSeed(appId, appTitle);
      const canvasEnvironment = parseCanvasEnvironment(formData.get('canvasEnvironment'));
      const clientId = requireTrimmedFormValue(
        formData.get('clientId'),
        'Canvas Client ID is required.',
      );
      const deploymentId = requireTrimmedFormValue(
        formData.get('deploymentId'),
        'Canvas Deployment ID is required.',
      );

      const deployment = await repository.saveDeploymentBinding({
        slug: seed.slug,
        label: seed.label,
        appId,
        binding: {
          canvasEnvironment,
          issuer: resolveCanvasIssuer(canvasEnvironment),
          clientId,
          deploymentId,
        },
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
        summary: 'Saved the Canvas deployment binding.',
        detail: {
          deploymentSlug: deployment.slug,
          canvasEnvironment,
          issuer: resolveCanvasIssuer(canvasEnvironment),
          clientId,
          deploymentId,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(context, services, appId, 'Canvas install blocked', error),
      );
    }
  });
}
