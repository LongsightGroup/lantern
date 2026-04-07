import type { Hono } from "@hono/hono";
import { renderDeepLinkingPickerResponse } from "./app_deep_linking_views.ts";
import {
  normalizeOptionalString,
  requireTrimmedFormValue,
  requireTrimmedString,
} from "./app_request_support.ts";
import {
  errorMessage,
  statusForDeepLinkingError,
  statusForDeepLinkingSessionError,
} from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";
import type { PackageReviewRepository } from "./package_review/repository.ts";
import { readEnv } from "./platform/env.ts";
import { launchPreviewRuntimeSession } from "./preview/service.ts";
import {
  buildRuntimeSessionUrl,
  requireConfiguredRuntimeOrigin,
} from "./runtime_origin.ts";
import {
  createDeepLinkingSession,
  listDeepLinkingResources,
  requireAuthorizedDeepLinkingSession,
  resolveDeepLinkingSelection,
  saveDeepLinkingSessionSelection,
  validateDeepLinkingRequest,
} from "./lti/deep_linking.ts";
import { isLtiBoundaryDenialError } from "./lti/launch_rejection.ts";
import { formatLmsLabel } from "./lti/platform_binding.ts";
import {
  buildResolvedLtiProfileDetail,
  resolveLtiProfileForDeployment,
} from "./lti/profile_resolution.ts";
import {
  buildRequestAuditEnvelope,
  type RequestAuditEnvelope,
} from "./request_audit.ts";

export function registerDeepLinkingRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.post("/lti/deep-linking", async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();
    const state = normalizeOptionalString(formData.get("state"));
    const idToken = normalizeOptionalString(formData.get("id_token"));
    const request = buildRequestAuditEnvelope({
      context,
      formData,
    });

    try {
      const request = await validateDeepLinkingRequest({
        repository,
        state: state ?? "",
        idToken: idToken ?? "",
        loadJwks: services.loadCanvasJwks,
      });
      const session = await createDeepLinkingSession({
        repository,
        request,
      });
      const deployment = await repository.getDeploymentBySlug(
        request.internalDeploymentSlug,
      );
      const ltiProfile = deployment === null
        ? null
        : await resolveLtiProfileForDeployment({
          repository,
          deployment,
        });
      await repository.recordAuditEvent({
        eventType: "deep_linking.request.accepted",
        actorType: "platform",
        actorId: request.userId,
        deploymentRecordId: request.internalDeploymentId,
        packageVersionId: deployment?.enabledPackageVersionId ?? null,
        attemptId: null,
        lineItemBindingId: null,
        status: "accepted",
        summary: `Accepted a ${
          formatLmsLabel(request.lms)
        } Deep Linking request.`,
        detail: {
          lms: request.lms,
          deepLinkingSessionId: session.sessionId,
          internalDeploymentSlug: request.internalDeploymentSlug,
          issuer: request.issuer,
          clientId: request.clientId,
          deploymentId: request.deploymentId,
          contextId: request.contextId,
          placement: request.placement,
          ...(ltiProfile === null
            ? {}
            : buildResolvedLtiProfileDetail(ltiProfile)),
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/lti/deep-linking/sessions/${session.sessionId}?token=${
          encodeURIComponent(
            session.sessionToken,
          )
        }`,
        303,
      );
    } catch (error) {
      await recordRejectedDeepLinkingRequestAudit({
        repository,
        state,
        error,
        request,
      });
      return context.text(
        errorMessage(error),
        statusForDeepLinkingError(error),
      );
    }
  });

  app.get("/lti/deep-linking/sessions/:sessionId", async (context) => {
    try {
      const repository = services.getRepository();
      const url = new URL(context.req.url);
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param("sessionId"),
        token: requireTrimmedString(
          url.searchParams.get("token"),
          "Deep Linking session token is required.",
        ),
      });

      return await renderDeepLinkingPickerResponse({
        context,
        repository,
        session,
        token: session.sessionToken,
        notice: null,
      });
    } catch (error) {
      return context.text(
        errorMessage(error),
        statusForDeepLinkingSessionError(error),
      );
    }
  });

  app.post("/lti/deep-linking/sessions/:sessionId", async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();

    try {
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param("sessionId"),
        token: requireTrimmedFormValue(
          formData.get("token"),
          "Deep Linking session token is required.",
        ),
      });

      try {
        const saved = await saveDeepLinkingSessionSelection({
          repository,
          session,
          selectionValue: requireTrimmedFormValue(
            formData.get("selection"),
            "Choose one reviewed resource before continuing.",
          ),
        });

        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session: saved.session,
          token: session.sessionToken,
          notice: {
            tone: "success",
            title: "Selection saved",
            detail:
              "Lantern saved the reviewed version and content path. Use the verified return action to post this selection back to the LMS.",
          },
        });
      } catch (error) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token: session.sessionToken,
          notice: {
            tone: "error",
            title: "Selection blocked",
            detail: errorMessage(error),
          },
          status: 400,
        });
      }
    } catch (error) {
      return context.text(
        errorMessage(error),
        statusForDeepLinkingSessionError(error),
      );
    }
  });

  app.post("/lti/deep-linking/sessions/:sessionId/preview", async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();

    try {
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param("sessionId"),
        token: requireTrimmedFormValue(
          formData.get("token"),
          "Deep Linking session token is required.",
        ),
      });

      try {
        const selection = resolveDeepLinkingSelection({
          session,
          resources: await listDeepLinkingResources({
            repository,
            session,
          }),
        });

        if (selection === null) {
          return await renderDeepLinkingPickerResponse({
            context,
            repository,
            session,
            token: session.sessionToken,
            notice: {
              tone: "error",
              title: "Preview blocked",
              detail: buildDeepLinkingPreviewMissingSelectionDetail(
                session.placement,
              ),
            },
            status: 409,
          });
        }

        const packageVersion = await repository.getPackageVersionById(
          selection.packageVersionId,
        );

        if (packageVersion === null) {
          throw new Error(
            `Reviewed package version ${selection.packageVersionId} could not be loaded for preview.`,
          );
        }

        const launched = await launchPreviewRuntimeSession({
          repository,
          packageVersion,
          artifactStore: services.runtimeArtifactStore,
          launch: {
            userRole: "instructor",
            courseId: session.contextId ?? "deep-linking-context",
            assignmentId: null,
            activityId: selection.activityId,
            contentPath: selection.contentPath,
          },
          previewOrigin: "deepLinkingAuthoring",
          deepLinkingSessionId: session.sessionId,
        });
        const runtimeOrigin = requireConfiguredRuntimeOrigin(
          readEnv("APP_RUNTIME_ORIGIN", services.env),
        );

        return context.redirect(
          buildRuntimeSessionUrl({
            runtimeOrigin,
            sessionId: launched.runtimeSession.sessionId,
            token: launched.runtimeSession.sessionToken,
          }),
          303,
        );
      } catch (error) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token: session.sessionToken,
          notice: {
            tone: "error",
            title: "Preview blocked",
            detail: errorMessage(error),
          },
          status: 409,
        });
      }
    } catch (error) {
      return context.text(
        errorMessage(error),
        statusForDeepLinkingSessionError(error),
      );
    }
  });
}

function buildDeepLinkingPreviewMissingSelectionDetail(
  placement: "assignment_selection" | "resource_selection",
): string {
  const resource = placement === "resource_selection"
    ? "course resource"
    : "assignment resource";

  return `Save one reviewed ${resource} before previewing it in Lantern.`;
}

async function recordRejectedDeepLinkingRequestAudit(input: {
  repository: PackageReviewRepository;
  state: string | null;
  error: unknown;
  request: RequestAuditEnvelope;
}): Promise<void> {
  if (!isLtiBoundaryDenialError(input.error)) {
    return;
  }

  const loginState = input.state === null
    ? null
    : await input.repository.getLoginStateByState(input.state).catch(() =>
      null
    );
  const deployment = loginState === null ? null : await input.repository
    .getDeploymentByBinding({
      lms: loginState.lms,
      issuer: loginState.issuer,
      clientId: loginState.clientId,
      deploymentId: loginState.deploymentId,
    })
    .catch(() => null);
  const ltiProfile = deployment === null
    ? null
    : await resolveLtiProfileForDeployment({
      repository: input.repository,
      deployment,
    });

  await input.repository.recordAuditEvent({
    eventType: "deep_linking.request.rejected",
    actorType: "platform",
    actorId: null,
    deploymentRecordId: deployment?.id ?? null,
    packageVersionId: deployment?.enabledPackageVersionId ?? null,
    attemptId: null,
    lineItemBindingId: null,
    status: "failed",
    summary: loginState === null
      ? "Rejected a Deep Linking request before Lantern could match the saved login state."
      : `Rejected a ${
        formatLmsLabel(
          loginState.lms,
        )
      } Deep Linking request before picker handoff.`,
    detail: {
      lms: loginState?.lms ?? null,
      category: input.error.category,
      code: input.error.code,
      message: input.error.message,
      request: input.request,
      ...input.error.detail,
      issuer: loginState?.issuer ?? null,
      clientId: loginState?.clientId ?? null,
      deploymentId: loginState?.deploymentId ?? null,
      targetLinkUri: loginState?.targetLinkUri ?? null,
      internalDeploymentSlug: deployment?.slug ?? null,
      appId: deployment?.appId ?? null,
      ...(ltiProfile === null ? {} : buildResolvedLtiProfileDetail(ltiProfile)),
    },
    occurredAt: new Date().toISOString(),
  });
}
