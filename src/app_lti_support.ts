import type { Context } from "@hono/hono";
import { createLoginRedirect } from "./lti/login.ts";
import { readLoginRequest } from "./app_request_support.ts";
import {
  errorMessage,
  normalizeLaunchRejectedCode,
  statusForError,
} from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";
import type { PackageReviewRepository } from "./package_review/repository.ts";

export async function handleLoginInitiation(
  context: Context,
  services: AppServices,
) {
  try {
    const loginRequest = await readLoginRequest(context);
    const result = await createLoginRedirect({
      repository: services.getRepository(),
      loginRequest,
    });

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
      code: normalizeLaunchRejectedCode(input.error),
      message: errorMessage(input.error),
      issuer: loginState?.issuer ?? null,
      clientId: loginState?.clientId ?? null,
      deploymentId: loginState?.deploymentId ?? null,
      targetLinkUri: loginState?.targetLinkUri ?? null,
      internalDeploymentSlug: deployment?.slug ?? null,
      appId: deployment?.appId ?? null,
    },
    occurredAt: new Date().toISOString(),
  });
}
