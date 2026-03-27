import type { Hono } from "@hono/hono";
import { renderDeploymentDetailPage } from "./admin/deployment_detail.ts";
import { renderPackageIndexPage } from "./admin/package_index.ts";
import {
  getLatestNrpsVerification,
  loadDeploymentDetailState,
  loadDeploymentDetailStateSafe,
} from "./app_deployment_support.ts";
import { combineNotices, createErrorNotice } from "./app_notice_support.ts";
import { requireTrimmedFormValue } from "./app_request_support.ts";
import { errorMessage, statusForNrpsError } from "./app_status_support.ts";
import { listCanvasEnvironments } from "./lti/config.ts";
import {
  type DeploymentBinding,
  LTI_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE,
  LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
  type RuntimeSessionRecord,
} from "./lti/types.ts";
import {
  publishFinalScore,
  readContextMemberships,
  requestCanvasServiceAccessToken,
} from "./lti/services.ts";
import type { AppServices } from "./app_services.ts";
import type { PackageReviewRepository } from "./package_review/repository.ts";
import type {
  AttemptRecord,
  DeploymentRecord,
} from "./package_review/types.ts";
import {
  buildSmokeVerificationLineItemSpec,
  ensureManagedLineItem,
  requestAccessToken,
} from "./runtime/gateway_publication_support.ts";

type SupportedSmokeLms = Extract<DeploymentBinding["lms"], "moodle" | "sakai">;

interface GradeSmokeAuditDetail {
  lms: SupportedSmokeLms;
  contextId: string | null;
  agsCapable: boolean;
  publicationStatus: "succeeded" | "failed" | "not_attempted";
  lineItemUrl: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

interface GradeSmokeVerificationResult {
  status: "succeeded" | "failed";
  summary: string;
  attemptId: string;
  detail: GradeSmokeAuditDetail;
}

export function registerAdminDeploymentOpsRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.post(
    "/admin/packages/:appId/deployment/verify-roster",
    async (context) => {
      const appId = context.req.param("appId");
      const repository = services.getRepository();

      try {
        const detail = await loadDeploymentDetailState(repository, appId);
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
          scopes: [LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE],
        });
        const members = await readContextMemberships({
          accessToken: token.accessToken,
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
        const detail = await loadDeploymentDetailStateSafe(repository, appId);
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
              notice: createErrorNotice("Deployment page unavailable", error),
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

  app.post(
    "/admin/packages/:appId/deployment/verify-grade-smoke",
    async (context) => {
      const appId = context.req.param("appId");
      const repository = services.getRepository();
      const opsRepository = services.getOpsRepository();
      let smokeLms: SupportedSmokeLms | null = null;
      let deploymentRecordId: number | null = null;

      try {
        const detail = await loadDeploymentDetailState(repository, appId);
        const formData = await context.req.formData();

        smokeLms = parseGradeSmokeLms(formData.get("lms"));
        deploymentRecordId = parseDeploymentRecordId(
          formData.get("deploymentRecordId"),
        );

        const targetDeployment = requireGradeSmokeDeployment(
          detail.deployments,
          smokeLms,
          deploymentRecordId,
        );
        const binding = requireGradeSmokeBinding(targetDeployment, smokeLms);
        const latestSession = await repository
          .getLatestRuntimeSessionByDeploymentId(
            targetDeployment.id,
          );

        if (latestSession === null) {
          throw new Error(
            `Launch the ${
              formatLmsLabel(smokeLms)
            } deployment once before running grade smoke verification.`,
          );
        }

        const attempt = await repository.getAttemptById(
          latestSession.attemptId,
        );

        if (attempt === null) {
          throw new Error(
            "Launch state is incomplete for this deployment. Try a fresh launch before running grade smoke verification.",
          );
        }

        const result = await runGradeSmokeVerification({
          appTitle: detail.appTitle,
          binding,
          session: latestSession,
          attempt,
        });

        await recordGradeSmokeAuditEvent(
          repository,
          targetDeployment,
          latestSession,
          result,
        );

        if (result.status === "succeeded") {
          return context.redirect(
            `/admin/packages/${appId}/deployment?lms=${smokeLms}#slot-panel`,
            303,
          );
        }

        const controlPlaneDetail = await opsRepository
          .getControlPlaneDeploymentDetail(targetDeployment.id);

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
                "Grade smoke verification failed",
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
              notice: createErrorNotice("Deployment page unavailable", error),
            }),
            statusForGradeSmokeError(error),
          );
        }

        const controlPlaneDetail = deploymentRecordId === null
          ? null
          : await opsRepository.getControlPlaneDeploymentDetail(
            deploymentRecordId,
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
              createErrorNotice("Grade smoke verification failed", error),
            ),
          }),
          statusForGradeSmokeError(error),
        );
      }
    },
  );
}

function parseGradeSmokeLms(
  value: FormDataEntryValue | null,
): SupportedSmokeLms {
  const lms = requireTrimmedFormValue(
    value,
    "Grade smoke LMS target is required.",
  );

  if (lms !== "moodle" && lms !== "sakai") {
    throw new Error(
      "Choose one supported Moodle or Sakai deployment before running grade smoke verification.",
    );
  }

  return lms;
}

function parseDeploymentRecordId(value: FormDataEntryValue | null): number {
  const rawValue = requireTrimmedFormValue(
    value,
    "Grade smoke deployment target is required.",
  );
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Grade smoke deployment target is required.");
  }

  return parsed;
}

function requireGradeSmokeDeployment(
  deployments: DeploymentRecord[],
  lms: SupportedSmokeLms,
  deploymentRecordId: number,
): DeploymentRecord {
  const deployment = deployments.find((candidate) =>
    candidate.id === deploymentRecordId
  );

  if (
    deployment === undefined ||
    deployment.lmsType !== lms ||
    deployment.binding?.lms !== lms
  ) {
    throw new Error(
      "Choose one supported Moodle or Sakai deployment before running grade smoke verification.",
    );
  }

  return deployment;
}

function requireGradeSmokeBinding(
  deployment: DeploymentRecord,
  lms: SupportedSmokeLms,
): Extract<DeploymentBinding, { lms: SupportedSmokeLms }> {
  if (deployment.binding === null || deployment.binding.lms !== lms) {
    throw new Error(
      `Save the exact ${
        formatLmsLabel(lms)
      } binding before running grade smoke verification.`,
    );
  }

  return deployment.binding;
}

async function runGradeSmokeVerification(input: {
  appTitle: string;
  binding: Extract<DeploymentBinding, { lms: SupportedSmokeLms }>;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
}): Promise<GradeSmokeVerificationResult> {
  const ags = input.session.services.ags;

  if (ags === null || ags.lineitemsUrl === null) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: false,
      publicationStatus: "not_attempted",
      lineItemUrl: null,
      code: "missing_ags_context",
      message:
        "Launch did not provide the AGS service context Lantern needs for smoke verification.",
    });
  }

  if (
    !ags.scope.includes(LTI_AGS_SCORE_SCOPE) ||
    !ags.scope.includes(LTI_AGS_LINEITEM_SCOPE)
  ) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: false,
      publicationStatus: "not_attempted",
      lineItemUrl: null,
      code: "missing_ags_scope",
      message:
        "Launch did not grant the AGS scopes Lantern needs for smoke verification.",
    });
  }

  const accessToken = await requestAccessToken({
    scope: ags.scope,
    binding: input.binding,
    lineItemBinding: null,
  });

  if (typeof accessToken !== "string") {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: "not_attempted",
      lineItemUrl: null,
      code: accessToken.publishError?.code ?? "token_request_failed",
      message: accessToken.publishError?.message ??
        "Lantern could not get a service token for smoke verification.",
    });
  }

  let lineItemUrl: string | null = null;

  try {
    const ensuredLineItem = await ensureManagedLineItem({
      accessToken,
      ags: {
        ...ags,
        lineitemUrl: null,
      },
      resourceLinkId: input.attempt.resourceLinkId,
      spec: buildSmokeVerificationLineItemSpec({
        appId: input.session.appId,
        appTitle: input.appTitle,
        lms: input.binding.lms,
      }),
    });

    lineItemUrl = ensuredLineItem.lineItemUrl;
  } catch (error) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: "not_attempted",
      lineItemUrl: null,
      code: "line_item_failed",
      message: errorMessage(error),
    });
  }

  try {
    await publishFinalScore({
      accessToken,
      lineItemUrl,
      canvasUserId: input.attempt.userId,
      scoreGiven: 1,
      scoreMaximum: 1,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    });
  } catch (error) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: "failed",
      lineItemUrl,
      code: "score_publish_failed",
      message: errorMessage(error),
    });
  }

  return {
    status: "succeeded",
    summary: `${
      formatLmsLabel(input.binding.lms)
    } AGS smoke verification succeeded.`,
    attemptId: input.attempt.attemptId,
    detail: {
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      agsCapable: true,
      publicationStatus: "succeeded",
      lineItemUrl,
      error: null,
    },
  };
}

async function recordGradeSmokeAuditEvent(
  repository: PackageReviewRepository,
  deployment: DeploymentRecord,
  session: RuntimeSessionRecord,
  result: GradeSmokeVerificationResult,
): Promise<void> {
  await repository.recordAuditEvent({
    eventType: "deployment.ags_smoke_verified",
    actorType: "system",
    actorId: null,
    deploymentRecordId: deployment.id,
    packageVersionId: deployment.enabledPackageVersionId ??
      session.packageVersionId,
    attemptId: result.attemptId,
    lineItemBindingId: null,
    status: result.status,
    summary: result.summary,
    detail: {
      lms: result.detail.lms,
      contextId: result.detail.contextId,
      agsCapable: result.detail.agsCapable,
      publicationStatus: result.detail.publicationStatus,
      lineItemUrl: result.detail.lineItemUrl,
      error: result.detail.error,
    },
    occurredAt: new Date().toISOString(),
  });
}

function buildGradeSmokeFailureResult(input: {
  lms: SupportedSmokeLms;
  contextId: string | null;
  attemptId: string;
  agsCapable: boolean;
  publicationStatus: GradeSmokeAuditDetail["publicationStatus"];
  lineItemUrl: string | null;
  code: string;
  message: string;
}): GradeSmokeVerificationResult {
  return {
    status: "failed",
    summary: `${formatLmsLabel(input.lms)} AGS smoke verification failed.`,
    attemptId: input.attemptId,
    detail: {
      lms: input.lms,
      contextId: input.contextId,
      agsCapable: input.agsCapable,
      publicationStatus: input.publicationStatus,
      lineItemUrl: input.lineItemUrl,
      error: {
        code: input.code,
        message: input.message,
      },
    },
  };
}

function statusForGradeSmokeError(error: unknown): 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("required") ||
    error.message.includes("Choose one supported") ||
    error.message.includes("Save the exact") ||
    error.message.includes("Import a package version") ||
    error.message.includes("Launch ")
  ) {
    return 409;
  }

  return 500;
}

function statusForGradeSmokeFailureCode(code: string | null): 409 | 500 {
  if (
    code === "missing_ags_context" ||
    code === "missing_ags_scope"
  ) {
    return 409;
  }

  return 500;
}

function formatLmsLabel(lms: SupportedSmokeLms): string {
  switch (lms) {
    case "moodle":
      return "Moodle";
    case "sakai":
      return "Sakai";
  }
}
