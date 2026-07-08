import type { Hono } from '@hono/hono';
import { renderDeploymentDetailPage } from './admin/deployment_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import {
  loadDeploymentDetailState,
  loadDeploymentDetailStateSafe,
} from './app_deployment_support.ts';
import { combineNotices, createErrorNotice } from './app_notice_support.ts';
import { requireTrimmedFormValue } from './app_request_support.ts';
import {
  errorMessage,
  normalizeRetryFailureCode,
  statusForRetryPublishError,
} from './app_status_support.ts';
import { listCanvasEnvironments } from './lti/config.ts';
import { retryFailedGradePublication } from './ops/service.ts';
import type { AppServices } from './app_services.ts';
import { resolveRequestAppOrigin } from './app_origin.ts';
import { buildRequestAuditEnvelope } from './request_audit.ts';

export function registerAdminDeploymentRetryRoutes(app: Hono, services: AppServices): void {
  app.post('/admin/packages/:appId/deployment/retry-grade-publish', async (context) => {
    const appId = context.req.param('appId');
    const repository = services.getRepository();
    const opsRepository = services.getOpsRepository();
    let attemptId: string | null = null;
    let request = buildRequestAuditEnvelope({ context });

    try {
      const appOrigin = resolveRequestAppOrigin(context, services.env);
      const detail = await loadDeploymentDetailState(repository, appId, appOrigin);
      const canvasDeployment = detail.canvasDeployment;

      if (canvasDeployment === null) {
        throw new Error(
          'Save the Canvas binding and exact deployment before retrying a grade publish.',
        );
      }

      const formData = await context.req.formData();
      request = buildRequestAuditEnvelope({
        context,
        formData,
      });
      attemptId = requireTrimmedFormValue(formData.get('attemptId'), 'Retry attempt is required.');
      const retryResult = await retryFailedGradePublication({
        repository: {
          getRetryableGradePublicationLookup: (candidateAttemptId) =>
            opsRepository.getRetryableGradePublicationLookup(candidateAttemptId),
          updateGradePublication: (input) => repository.updateGradePublication(input),
        },
        attemptId,
        getLtiToolContext: () => services.getLtiToolContext(appOrigin),
      });

      if (retryResult.publication.status === 'published') {
        await repository.recordAuditEvent({
          eventType: 'grade_publish.retry_succeeded',
          actorType: 'user',
          actorId: null,
          deploymentRecordId: canvasDeployment.id,
          packageVersionId: canvasDeployment.enabledPackageVersionId,
          attemptId: retryResult.attemptId,
          lineItemBindingId: null,
          status: 'succeeded',
          summary: 'Retried the failed Canvas AGS score publish from the control plane.',
          detail: {
            attemptId: retryResult.attemptId,
            code: 'retry_succeeded',
          },
          occurredAt: new Date().toISOString(),
        });

        return context.redirect(`/admin/packages/${appId}/deployment`, 303);
      }

      await repository.recordAuditEvent({
        eventType: 'grade_publish.retry_failed',
        actorType: 'user',
        actorId: null,
        deploymentRecordId: canvasDeployment.id,
        packageVersionId: canvasDeployment.enabledPackageVersionId,
        attemptId: retryResult.attemptId,
        lineItemBindingId: null,
        status: 'failed',
        summary: 'Retrying the Canvas AGS score publish failed.',
        detail: {
          attemptId: retryResult.attemptId,
          code: retryResult.publication.errorCode ?? 'score_publish_failed',
          request,
        },
        occurredAt: new Date().toISOString(),
      });

      const controlPlaneDetail = await opsRepository.getControlPlaneDeploymentDetail(
        canvasDeployment.id,
      );

      return context.html(
        renderDeploymentDetailPage({
          appId,
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          nrpsVerification: detail.nrpsVerification,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: combineNotices(
            detail.canvasConfigUrl.notice,
            createErrorNotice(
              'Grade publish retry failed',
              new Error(retryResult.publication.errorCode ?? 'Canvas AGS score publish failed.'),
            ),
          ),
        }),
        500,
      );
    } catch (error) {
      const detail = await loadDeploymentDetailStateSafe(
        repository,
        appId,
        resolveRequestAppOrigin(context, services.env),
      );
      const canvasDeployment = detail.canvasDeployment;

      if (canvasDeployment !== null) {
        await repository.recordAuditEvent({
          eventType: 'grade_publish.retry_failed',
          actorType: 'user',
          actorId: null,
          deploymentRecordId: canvasDeployment.id,
          packageVersionId: canvasDeployment.enabledPackageVersionId,
          attemptId,
          lineItemBindingId: null,
          status: 'failed',
          summary: 'Retrying the Canvas AGS score publish failed.',
          detail: {
            attemptId,
            code: normalizeRetryFailureCode(error),
            message: errorMessage(error),
            request,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      if (detail.history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: createErrorNotice('Connections page unavailable', error),
          }),
          statusForRetryPublishError(error),
        );
      }

      const controlPlaneDetail = canvasDeployment === null
        ? null
        : await opsRepository.getControlPlaneDeploymentDetail(canvasDeployment.id);

      return context.html(
        renderDeploymentDetailPage({
          appId,
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          nrpsVerification: detail.nrpsVerification,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: combineNotices(
            detail.canvasConfigUrl.notice,
            createErrorNotice('Grade publish retry failed', error),
          ),
        }),
        statusForRetryPublishError(error),
      );
    }
  });
}
