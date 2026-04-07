import type { Hono } from '@hono/hono';
import { getManagedDeploymentSlot } from './admin/deployment_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import { loadDeploymentDetailState } from './app_deployment_support.ts';
import {
  buildBindingAuditDetail,
  buildDeploymentBindingFromFormData,
  canPinDeploymentVersion,
  formatLmsLabel,
  parseManagedDeploymentLms,
  parseOptionalManagedDeploymentLms,
  parseRequiredPackageVersionId,
} from './app_admin_deployment_detail_route_support.ts';
import {
  buildInstallEditorState,
  buildPinEditorState,
} from './app_admin_deployment_editor_state.ts';
import { parseDeploymentLtiProfileOverrideForm } from './app_request_support.ts';
import type { LmsType } from './lti/types.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import { resolveConfiguredPublicOrigin } from './public_origin.ts';

export function registerAdminDeploymentFormRoutes(app: Hono, services: AppServices): void {
  app.post('/admin/packages/:appId/deployment/pin', async (context) => {
    const appId = context.req.param('appId');
    let lms: LmsType | null = null;
    let formData: FormData | null = null;

    try {
      const repository = services.getRepository();
      const appOrigin = resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header('forwarded') ?? null,
        xForwardedHost: context.req.header('x-forwarded-host') ?? null,
        xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
        configuredOrigin: readEnv('APP_ORIGIN', services.env),
      });
      formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: `${formatLmsLabel(lms)} version picker unavailable`,
              detail: `Import the app package before you attempt to save the ${formatLmsLabel(
                lms,
              )} deployment pin.`,
            },
          }),
          404,
        );
      }

      const detail = await loadDeploymentDetailState(repository, appId, appOrigin);
      const slot = getManagedDeploymentSlot(detail.slots, lms);

      if (!canPinDeploymentVersion(slot, lms)) {
        throw new Error(`Save the ${formatLmsLabel(lms)} binding before you pin a version.`);
      }

      const selectedId = parseRequiredPackageVersionId(formData);

      const deployment = await repository.pinDeploymentVersion({
        slug: slot.deployment.slug,
        label: slot.deployment.label,
        appId,
        lmsType: lms,
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
        summary: `Pinned an exact reviewed package version for the ${formatLmsLabel(
          lms,
        )} deployment.`,
        detail: {
          lms,
          deploymentSlug: deployment.slug,
          packageVersionId: deployment.enabledPackageVersionId,
          packageVersion: deployment.enabledPackageVersion,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment?lms=${lms}#slot-panel`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null ? 'Version pin blocked' : `${formatLmsLabel(lms)} version pin blocked`,
          error,
          {
            selectedLms: lms,
            editorState: buildPinEditorState(
              lms,
              formData,
              lms === null ? 'Version pin blocked' : `${formatLmsLabel(lms)} version pin blocked`,
              error,
            ),
          },
        ),
      );
    }
  });

  app.post('/admin/packages/:appId/deployment/install', async (context) => {
    const appId = context.req.param('appId');
    let lms: LmsType | null = null;
    let formData: FormData | null = null;

    try {
      const repository = services.getRepository();
      const appOrigin = resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header('forwarded') ?? null,
        xForwardedHost: context.req.header('x-forwarded-host') ?? null,
        xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
        configuredOrigin: readEnv('APP_ORIGIN', services.env),
      });
      formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: 'error',
              title: `${formatLmsLabel(lms)} install unavailable`,
              detail: `Import the app package before you attempt to save the ${formatLmsLabel(
                lms,
              )} binding.`,
            },
          }),
          404,
        );
      }

      const detail = await loadDeploymentDetailState(repository, appId, appOrigin);
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

      return context.redirect(`/admin/packages/${appId}/deployment?lms=${lms}#slot-panel`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null ? 'Deployment install blocked' : `${formatLmsLabel(lms)} install blocked`,
          error,
          {
            selectedLms: lms,
            editorState: buildInstallEditorState(
              lms,
              formData,
              lms === null
                ? 'Deployment install blocked'
                : `${formatLmsLabel(lms)} install blocked`,
              error,
            ),
          },
        ),
      );
    }
  });

  app.post('/admin/packages/:appId/deployment/lti-profile', async (context) => {
    const appId = context.req.param('appId');
    let lms: LmsType | null = null;

    try {
      const repository = services.getRepository();
      const appOrigin = resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header('forwarded') ?? null,
        xForwardedHost: context.req.header('x-forwarded-host') ?? null,
        xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
        configuredOrigin: readEnv('APP_ORIGIN', services.env),
      });
      const formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const detail = await loadDeploymentDetailState(repository, appId, appOrigin);
      const slot = getManagedDeploymentSlot(detail.slots, lms);

      if (!slot.persisted) {
        throw new Error(
          `Save the ${formatLmsLabel(lms)} binding before you choose an LTI profile.`,
        );
      }

      await repository.saveDeploymentLtiProfileOverride({
        deploymentId: slot.deployment.id,
        ltiProfileOverride: parseDeploymentLtiProfileOverrideForm(formData),
      });

      return context.redirect(`/admin/packages/${appId}/deployment?lms=${lms}#slot-panel`, 303);
    } catch (error) {
      return await import('./app_admin_support.ts').then(({ renderDeploymentError }) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null
            ? 'LTI profile update blocked'
            : `${formatLmsLabel(lms)} LTI profile update blocked`,
          error,
          {
            selectedLms:
              lms ??
              parseOptionalManagedDeploymentLms(new URL(context.req.url).searchParams.get('lms')),
          },
        ),
      );
    }
  });
}
