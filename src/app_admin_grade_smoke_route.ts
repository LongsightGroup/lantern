import type { Hono } from '@hono/hono';
import { renderDeploymentDetailPage } from './admin/deployment_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import {
  loadDeploymentDetailState,
  loadDeploymentDetailStateSafe,
} from './app_deployment_support.ts';
import { combineNotices, createErrorNotice } from './app_notice_support.ts';
import { listCanvasEnvironments } from './lti/config.ts';
import { resolveLtiProfileForDeployment } from './lti/profile_resolution.ts';
import type { AppServices } from './app_services.ts';
import {
  recordGradeSmokeAuditEvent,
  runGradeSmokeVerification,
} from './app_admin_grade_smoke_support.ts';
import { readEnv } from './platform/env.ts';
import { resolveConfiguredPublicOrigin } from './public_origin.ts';
import {
  formatGradeSmokeLmsLabel,
  parseDeploymentRecordId,
  parseGradeSmokeLms,
  requireGradeSmokeBinding,
  requireGradeSmokeDeployment,
  statusForGradeSmokeError,
  statusForGradeSmokeFailureCode,
} from './app_admin_grade_smoke_validation.ts';

export function registerAdminGradeSmokeRoute(app: Hono, services: AppServices): void {
  app.post('/admin/packages/:appId/deployment/verify-grade-smoke', async (context) => {
    const appId = context.req.param('appId');
    const repository = services.getRepository();
    const opsRepository = services.getOpsRepository();
    let smokeLms: 'moodle' | 'sakai' | null = null;
    let deploymentRecordId: number | null = null;

    try {
      const appOrigin = resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header('forwarded') ?? null,
        xForwardedHost: context.req.header('x-forwarded-host') ?? null,
        xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
        configuredOrigin: readEnv('APP_ORIGIN', services.env),
      });
      const detail = await loadDeploymentDetailState(repository, appId, appOrigin);
      const formData = await context.req.formData();

      smokeLms = parseGradeSmokeLms(formData.get('lms'));
      deploymentRecordId = parseDeploymentRecordId(formData.get('deploymentRecordId'));

      const targetDeployment = requireGradeSmokeDeployment(
        detail.deployments,
        smokeLms,
        deploymentRecordId,
      );
      const ltiProfile = await resolveLtiProfileForDeployment({
        repository,
        deployment: targetDeployment,
      });
      const binding = requireGradeSmokeBinding(targetDeployment, smokeLms);
      const latestSession = await repository.getLatestRuntimeSessionByDeploymentId(
        targetDeployment.id,
      );

      if (latestSession === null) {
        throw new Error(
          `Launch the ${formatGradeSmokeLmsLabel(
            smokeLms,
          )} setup once before running a grade return check.`,
        );
      }

      const attempt = await repository.getAttemptById(latestSession.attemptId);

      if (attempt === null) {
        throw new Error(
          'Launch state is incomplete for this setup. Try a fresh launch before running a grade return check.',
        );
      }

      const result = await runGradeSmokeVerification({
        repository,
        appTitle: detail.appTitle,
        binding,
        session: latestSession,
        attempt,
        env: services.env,
        ltiProfile,
      });

      await recordGradeSmokeAuditEvent(
        repository,
        targetDeployment,
        latestSession,
        result,
        ltiProfile,
      );

      if (result.status === 'succeeded') {
        return context.redirect(
          `/admin/packages/${appId}/deployment?lms=${smokeLms}#slot-panel`,
          303,
        );
      }

      const controlPlaneDetail = await opsRepository.getControlPlaneDeploymentDetail(
        targetDeployment.id,
      );

      return context.html(
        renderDeploymentDetailPage({
          appId,
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          selectedLms: smokeLms,
          nrpsVerification: detail.nrpsVerification,
          lanternLtiProfileSettings: detail.ltiProfileSettings,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: combineNotices(
            detail.canvasConfigUrl.notice,
            createErrorNotice(
              'Grade return check failed',
              new Error(result.detail.error?.message ?? result.summary),
            ),
          ),
        }),
        statusForGradeSmokeFailureCode(result.detail.error?.code ?? null),
      );
    } catch (error) {
      const detail = await loadDeploymentDetailStateSafe(
        repository,
        appId,
        resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header('forwarded') ?? null,
          xForwardedHost: context.req.header('x-forwarded-host') ?? null,
          xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
          configuredOrigin: readEnv('APP_ORIGIN', services.env),
        }),
      );

      if (detail.history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Connections page unavailable', error),
          }),
          statusForGradeSmokeError(error),
        );
      }

      const controlPlaneDetail =
        deploymentRecordId === null
          ? null
          : await opsRepository.getControlPlaneDeploymentDetail(deploymentRecordId);

      return context.html(
        renderDeploymentDetailPage({
          appId,
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          selectedLms: smokeLms,
          nrpsVerification: detail.nrpsVerification,
          lanternLtiProfileSettings: detail.ltiProfileSettings,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: combineNotices(
            detail.canvasConfigUrl.notice,
            createErrorNotice('Grade return check failed', error),
          ),
        }),
        statusForGradeSmokeError(error),
      );
    }
  });
}
