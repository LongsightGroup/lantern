import type { Hono } from '@hono/hono';
import { renderDeploymentDetailPage } from './admin/deployment_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import {
  loadDeploymentDetailState,
  loadDeploymentDetailStateSafe,
} from './app_deployment_support.ts';
import { combineNotices, createErrorNotice } from './app_notice_support.ts';
import { listCanvasEnvironments } from './lti/config.ts';
import type { AppServices } from './app_services.ts';
import {
  recordGradeSmokeAuditEvent,
  runGradeSmokeVerification,
} from './app_admin_grade_smoke_support.ts';
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
      const detail = await loadDeploymentDetailState(repository, appId);
      const formData = await context.req.formData();

      smokeLms = parseGradeSmokeLms(formData.get('lms'));
      deploymentRecordId = parseDeploymentRecordId(formData.get('deploymentRecordId'));

      const targetDeployment = requireGradeSmokeDeployment(
        detail.deployments,
        smokeLms,
        deploymentRecordId,
      );
      const binding = requireGradeSmokeBinding(targetDeployment, smokeLms);
      const latestSession = await repository.getLatestRuntimeSessionByDeploymentId(
        targetDeployment.id,
      );

      if (latestSession === null) {
        throw new Error(
          `Launch the ${formatGradeSmokeLmsLabel(
            smokeLms,
          )} deployment once before running grade smoke verification.`,
        );
      }

      const attempt = await repository.getAttemptById(latestSession.attemptId);

      if (attempt === null) {
        throw new Error(
          'Launch state is incomplete for this deployment. Try a fresh launch before running grade smoke verification.',
        );
      }

      const result = await runGradeSmokeVerification({
        appTitle: detail.appTitle,
        binding,
        session: latestSession,
        attempt,
      });

      await recordGradeSmokeAuditEvent(repository, targetDeployment, latestSession, result);

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
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: combineNotices(
            detail.canvasConfigUrl.notice,
            createErrorNotice(
              'Grade smoke verification failed',
              new Error(result.detail.error?.message ?? result.summary),
            ),
          ),
        }),
        statusForGradeSmokeFailureCode(result.detail.error?.code ?? null),
      );
    } catch (error) {
      const detail = await loadDeploymentDetailStateSafe(repository, appId);

      if (detail.history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Deployment page unavailable', error),
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
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: combineNotices(
            detail.canvasConfigUrl.notice,
            createErrorNotice('Grade smoke verification failed', error),
          ),
        }),
        statusForGradeSmokeError(error),
      );
    }
  });
}
