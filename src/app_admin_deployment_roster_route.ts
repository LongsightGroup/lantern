import type { Hono } from "@hono/hono";
import { renderDeploymentDetailPage } from "./admin/deployment_detail.ts";
import { renderPackageIndexPage } from "./admin/package_index.ts";
import {
  getLatestNrpsVerification,
  loadDeploymentDetailState,
  loadDeploymentDetailStateSafe,
} from "./app_deployment_support.ts";
import { combineNotices, createErrorNotice } from "./app_notice_support.ts";
import { errorMessage, statusForNrpsError } from "./app_status_support.ts";
import { listCanvasEnvironments } from "./lti/config.ts";
import { LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE } from "./lti/types.ts";
import {
  readContextMemberships,
  requestCanvasServiceAccessToken,
} from "./lti/services.ts";
import { recordInteropPathUsed } from "./interop_audit.ts";
import type { AppServices } from "./app_services.ts";
import { resolveConfiguredPublicOrigin } from "./public_origin.ts";

export function registerAdminDeploymentRosterRoute(
  app: Hono,
  services: AppServices,
): void {
  app.post(
    "/admin/packages/:appId/deployment/verify-roster",
    async (context) => {
      const appId = context.req.param("appId");
      const repository = services.getRepository();

      try {
        const appOrigin = resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header("forwarded") ?? null,
          xForwardedHost: context.req.header("x-forwarded-host") ?? null,
          xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
          configuredOrigin: Deno.env.get("APP_ORIGIN"),
        });
        const detail = await loadDeploymentDetailState(
          repository,
          appId,
          appOrigin,
        );
        const canvasDeployment = detail.canvasDeployment;

        if (canvasDeployment === null) {
          throw new Error(
            "Save the Canvas binding and exact deployment before verifying roster access.",
          );
        }

        if (
          canvasDeployment.binding === null ||
          canvasDeployment.binding.lms !== "canvas"
        ) {
          throw new Error(
            "Canvas deployment binding is required before roster verification can run.",
          );
        }

        const latestSession = await repository
          .getLatestRuntimeSessionByDeploymentId(
            canvasDeployment.id,
          );

        if (latestSession === null) {
          throw new Error(
            "Launch the deployment from Canvas once before verifying roster access.",
          );
        }

        if (latestSession.services.nrps === null) {
          throw new Error(
            "Launch did not provide NRPS service context for this deployment.",
          );
        }

        const token = await requestCanvasServiceAccessToken({
          issuer: canvasDeployment.binding.issuer,
          clientId: canvasDeployment.binding.clientId,
          deploymentId: canvasDeployment.binding.deploymentId,
          scopes: [LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE],
        });
        const retryUnauthorized = async () => {
          await recordInteropPathUsed({
            repository,
            scope: "service",
            path: "service_401_retry",
            actorType: "system",
            deploymentRecordId: canvasDeployment.id,
            packageVersionId: canvasDeployment.enabledPackageVersionId,
            attemptId: latestSession.attemptId,
            summary: "Lantern retried an LMS service request after a 401.",
            detail: {
              lms: "canvas",
              deploymentSlug: canvasDeployment.slug,
            },
          });
          const refreshed = await requestCanvasServiceAccessToken({
            issuer: canvasDeployment.binding!.issuer,
            clientId: canvasDeployment.binding!.clientId,
            deploymentId: canvasDeployment.binding!.deploymentId,
            scopes: [LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE],
          });

          return refreshed.accessToken;
        };
        const members = await readContextMemberships({
          accessToken: token.accessToken,
          retryUnauthorized,
          contextMembershipsUrl:
            latestSession.services.nrps.contextMembershipsUrl,
        });

        await repository.recordAuditEvent({
          eventType: "deployment.nrps_verified",
          actorType: "system",
          actorId: null,
          deploymentRecordId: canvasDeployment.id,
          packageVersionId: canvasDeployment.enabledPackageVersionId,
          attemptId: latestSession.attemptId,
          lineItemBindingId: null,
          status: "succeeded",
          summary:
            "Read Canvas roster memberships through the launch-scoped NRPS service.",
          detail: {
            contextId: latestSession.launch.courseId,
            memberCount: members.length,
          },
          occurredAt: new Date().toISOString(),
        });

        return context.redirect(`/admin/packages/${appId}/deployment`, 303);
      } catch (error) {
        const detail = await loadDeploymentDetailStateSafe(
          repository,
          appId,
          resolveConfiguredPublicOrigin({
            requestUrl: context.req.url,
            forwardedHeader: context.req.header("forwarded") ?? null,
            xForwardedHost: context.req.header("x-forwarded-host") ?? null,
            xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
            configuredOrigin: Deno.env.get("APP_ORIGIN"),
          }),
        );
        const canvasDeployment = detail.canvasDeployment;

        if (canvasDeployment !== null) {
          await repository.recordAuditEvent({
            eventType: "deployment.nrps_verified",
            actorType: "system",
            actorId: null,
            deploymentRecordId: canvasDeployment.id,
            packageVersionId: canvasDeployment.enabledPackageVersionId,
            attemptId: null,
            lineItemBindingId: null,
            status: "failed",
            summary: "Canvas roster verification failed.",
            detail: {
              message: errorMessage(error),
            },
            occurredAt: new Date().toISOString(),
          });
        }
        const nrpsVerification = canvasDeployment === null
          ? detail.nrpsVerification
          : await getLatestNrpsVerification(repository, canvasDeployment.id);

        if (detail.history.length === 0) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: createErrorNotice("Connections page unavailable", error),
            }),
            statusForNrpsError(error),
          );
        }

        return context.html(
          renderDeploymentDetailPage({
            appId,
            appTitle: detail.appTitle,
            history: detail.history,
            deployments: detail.deployments,
            nrpsVerification,
            canvasConfigUrl: detail.canvasConfigUrl.url,
            supportedCanvasEnvironments: listCanvasEnvironments(),
            notice: combineNotices(
              detail.canvasConfigUrl.notice,
              createErrorNotice("Roster verification failed", error),
            ),
          }),
          statusForNrpsError(error),
        );
      }
    },
  );
}
