import type { Hono } from '@hono/hono';
import {
  getManagedDeploymentSlot,
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
import type { DeploymentBinding, LmsType } from './lti/types.ts';
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
    let lms: LmsType | null = null;

    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: `${formatLmsLabel(lms)} version picker unavailable`,
              detail: `Import the app package before you attempt to save the ${formatLmsLabel(lms)} deployment pin.`,
            },
          }),
          404,
        );
      }

      const selectedId = Number(formData.get('packageVersionId'));
      const detail = await loadDeploymentDetailState(repository, appId);
      const slot = getManagedDeploymentSlot(detail.slots, lms);

      const deployment = await repository.pinDeploymentVersion({
        slug: slot.deployment.slug,
        label: slot.deployment.label,
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
        summary: `Pinned an exact reviewed package version for the ${formatLmsLabel(lms)} deployment.`,
        detail: {
          lms,
          deploymentSlug: deployment.slug,
          packageVersionId: deployment.enabledPackageVersionId,
          packageVersion: deployment.enabledPackageVersion,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null ? 'Version pin blocked' : `${formatLmsLabel(lms)} version pin blocked`,
          error,
        ),
      );
    }
  });

  app.post('/admin/packages/:appId/deployment/install', async (context) => {
    const appId = context.req.param('appId');
    let lms: LmsType | null = null;

    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: `${formatLmsLabel(lms)} install unavailable`,
              detail: `Import the app package before you attempt to save the ${formatLmsLabel(lms)} binding.`,
            },
          }),
          404,
        );
      }

      const detail = await loadDeploymentDetailState(repository, appId);
      const slot = getManagedDeploymentSlot(detail.slots, lms);
      const binding = buildDeploymentBindingFromFormData(lms, formData);

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
        summary: `Saved the ${formatLmsLabel(lms)} deployment binding.`,
        detail: {
          deploymentSlug: deployment.slug,
          ...buildBindingAuditDetail(binding),
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null ? 'Deployment install blocked' : `${formatLmsLabel(lms)} install blocked`,
          error,
        ),
      );
    }
  });
}

function parseManagedDeploymentLms(formData: FormData): LmsType {
  const value = requireTrimmedFormValue(formData.get('lms'), 'LMS is required.');

  switch (value) {
    case 'canvas':
    case 'moodle':
    case 'sakai':
      return value;
    default:
      throw new Error('Choose one supported LMS deployment.');
  }
}

function buildDeploymentBindingFromFormData(
  lms: LmsType,
  formData: FormData,
): DeploymentBinding {
  switch (lms) {
    case 'canvas': {
      buildCanvasConfigUrl();
      const canvasEnvironment = parseCanvasEnvironment(formData.get('canvasEnvironment'));

      return {
        lms: 'canvas',
        canvasEnvironment,
        issuer: resolveCanvasIssuer(canvasEnvironment),
        clientId: requireTrimmedFormValue(
          formData.get('clientId'),
          'Canvas Client ID is required.',
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get('deploymentId'),
          'Canvas Deployment ID is required.',
        ),
      };
    }
    case 'moodle':
      return {
        lms: 'moodle',
        issuer: requireTrimmedFormValue(formData.get('issuer'), 'Moodle Platform ID is required.'),
        clientId: requireTrimmedFormValue(
          formData.get('clientId'),
          'Moodle Client ID is required.',
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get('deploymentId'),
          'Moodle Deployment ID is required.',
        ),
        authenticationRequestUrl: requireTrimmedFormValue(
          formData.get('authenticationRequestUrl'),
          'Moodle Authentication request URL is required.',
        ),
        accessTokenUrl: requireTrimmedFormValue(
          formData.get('accessTokenUrl'),
          'Moodle Access token URL is required.',
        ),
        jwksUrl: requireTrimmedFormValue(
          formData.get('jwksUrl'),
          'Moodle Public keyset URL is required.',
        ),
      };
    case 'sakai':
      return {
        lms: 'sakai',
        issuer: requireTrimmedFormValue(formData.get('issuer'), 'Sakai Platform ID is required.'),
        clientId: requireTrimmedFormValue(
          formData.get('clientId'),
          'Sakai Client ID is required.',
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get('deploymentId'),
          'Sakai Deployment ID is required.',
        ),
        oidcAuthenticationUrl: requireTrimmedFormValue(
          formData.get('oidcAuthenticationUrl'),
          'Sakai OIDC authentication URL is required.',
        ),
        accessTokenUrl: requireTrimmedFormValue(
          formData.get('accessTokenUrl'),
          'Sakai Access token URL is required.',
        ),
        jwksUrl: requireTrimmedFormValue(
          formData.get('jwksUrl'),
          'Sakai Public keyset URL is required.',
        ),
      };
  }
}

function buildBindingAuditDetail(binding: DeploymentBinding): Record<string, string> {
  switch (binding.lms) {
    case 'canvas':
      return {
        lms: binding.lms,
        canvasEnvironment: binding.canvasEnvironment,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      };
    case 'moodle':
      return {
        lms: binding.lms,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
        authenticationRequestUrl: binding.authenticationRequestUrl,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
    case 'sakai':
      return {
        lms: binding.lms,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
        oidcAuthenticationUrl: binding.oidcAuthenticationUrl,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
  }
}

function formatLmsLabel(lms: LmsType): string {
  switch (lms) {
    case 'canvas':
      return 'Canvas';
    case 'moodle':
      return 'Moodle';
    case 'sakai':
      return 'Sakai';
  }
}
