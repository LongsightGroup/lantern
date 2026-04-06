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
import { resolveConfiguredPublicOrigin } from './public_origin.ts';

export function registerAdminDeploymentRetryRoutes(app: Hono, services: AppServices): void {
  app.post('/admin/packages/:appId/deployment/retry-grade-publish', async (context) => {
    const appId = context.req.param('appId');
    const repository = services.getRepository();
    const opsRepository = services.getOpsRepository();
    let attemptId: string | null = null;

    try {
      const appOrigin = resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header('forwarded') ?? null,
        xForwardedHost: context.req.header('x-forwarded-host') ?? null,
        xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
        configuredOrigin: Deno.env.get('APP_ORIGIN'),
      });
      const detail = await loadDeploymentDetailState(repository, appId, appOrigin);
      const canvasDeployment = detail.canvasDeployment;

      if (canvasDeployment === null) {
        throw new Error(
          'Save the Canvas binding and exact deployment before retrying a grade publish.',
        );
      }

      const formData = await context.req.formData();
      attemptId = requireTrimmedFormValue(formData.get('attemptId'), 'Retry attempt is required.');
      const retryResult = await retryFailedGradePublication({
        repository: {
          getDeploymentByBinding: (binding) => repository.getDeploymentByBinding(binding),
          getLanternLtiProfileSettings: () => repository.getLanternLtiProfileSettings(),
          getRetryableGradePublicationLookup: (candidateAttemptId) =>
            opsRepository.getRetryableGradePublicationLookup(candidateAttemptId),
          recordAuditEvent: (input) => repository.recordAuditEvent(input),
          updateGradePublication: (input) => repository.updateGradePublication(input),
        },
        attemptId,
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
        resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header('forwarded') ?? null,
          xForwardedHost: context.req.header('x-forwarded-host') ?? null,
          xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
          configuredOrigin: Deno.env.get('APP_ORIGIN'),
        }),
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

      const controlPlaneDetail =
        canvasDeployment === null
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
