import type { Context } from "@hono/hono";
import { createLoginRedirect } from "./lti/login.ts";
import {
  buildResolvedLtiProfileDetail,
  resolveLtiProfileForDeployment,
} from "./lti/profile_resolution.ts";
import { isLaunchRejectionError } from "./lti/launch_rejection.ts";
import { readLoginRequest } from "./app_request_support.ts";
import { errorMessage, statusForError } from "./app_status_support.ts";
import { renderTopLevelLaunchPage } from "./app_lti_views.ts";
import type { AppServices } from "./app_services.ts";
import { recordInteropPathUsed } from "./interop_audit.ts";
import type { PackageReviewRepository } from "./package_review/repository.ts";
import { resolveConfiguredPublicOrigin } from "./public_origin.ts";

export async function handleLoginInitiation(
  context: Context,
  services: AppServices,
) {
  try {
    const loginRequest = await readLoginRequest(context);
    const repository = services.getRepository();
    const result = await createLoginRedirect({
      repository,
      loginRequest: loginRequest.request,
      appOrigin: resolveConfiguredPublicOrigin({
        requestUrl: context.req.url,
        forwardedHeader: context.req.header("forwarded") ?? null,
        xForwardedHost: context.req.header("x-forwarded-host") ?? null,
        xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
        configuredOrigin: Deno.env.get("APP_ORIGIN"),
      }),
    });
    const compatibilityPaths = [
      ...(loginRequest.compatibility.decodedLoginHint
        ? ["opaque_login_hint_decode"]
        : []),
      ...(loginRequest.compatibility.decodedLtiMessageHint
        ? ["opaque_lti_message_hint_decode"]
        : []),
      ...(context.req.header("sec-fetch-dest") === "iframe"
        ? ["iframe_top_level_escape"]
        : []),
    ];
    const deployment = compatibilityPaths.length === 0
      ? null
      : await repository.getDeploymentBySlug(result.deploymentSlug);
    const ltiProfile = deployment === null
      ? null
      : await resolveLtiProfileForDeployment({
        repository,
        deployment,
      });

    await Promise.all(
      compatibilityPaths.map((path) =>
        recordInteropPathUsed({
          repository,
          scope: "login",
          path,
          actorType: "platform",
          deploymentRecordId: result.deploymentRecordId,
          packageVersionId: result.packageVersionId,
          summary: "Lantern used an LTI login compatibility path.",
          detail: {
            deploymentSlug: result.deploymentSlug,
            issuer: result.loginState.issuer,
            clientId: result.loginState.clientId,
            deploymentId: result.loginState.deploymentId,
          },
          ltiProfile,
        })
      ),
    );

    if (context.req.header("sec-fetch-dest") === "iframe") {
      return context.html(
        renderTopLevelLaunchPage({
          location: result.location,
        }),
      );
    }

    return context.redirect(result.location, 302);
  } catch (error) {
    return context.text(errorMessage(error), statusForError(error));
  }
}

export async function recordRejectedLaunchAudit(input: {
  repository: PackageReviewRepository;
  state: string | null;
  error: unknown;
}): Promise<void> {
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
  const rejection = readLaunchRejection(input.error);

  await input.repository.recordAuditEvent({
    eventType: "launch.rejected",
    actorType: "platform",
    actorId: null,
    deploymentRecordId: deployment?.id ?? null,
    packageVersionId: deployment?.enabledPackageVersionId ?? null,
    attemptId: null,
    lineItemBindingId: null,
    status: "failed",
    summary: "Rejected the governed LTI launch before runtime handoff.",
    detail: {
      lms: loginState?.lms ?? null,
      code: rejection?.code ?? "launch_validation_failed",
      message: rejection?.message ?? errorMessage(input.error),
      ...rejection?.detail,
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

function readLaunchRejection(input: unknown): {
  code: string;
  message: string;
  detail: Record<string, string | null>;
} | null {
  if (!isLaunchRejectionError(input)) {
    return null;
  }

  return {
    code: input.code,
    message: input.message,
    detail: input.detail,
  };
}
