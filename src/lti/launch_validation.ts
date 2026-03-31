import type { JSONWebKeySet } from "jose";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import {
  optionalRecordClaim,
  optionalStringClaim,
  requireRecordClaim,
  requireStringClaim,
  requireTrimmedValue,
  resolveUserRole,
  validateLtiAudience,
} from "./claim_support.ts";
import { parseLaunchServiceClaims } from "./launch_service_claims.ts";
import { recordInteropPathUsed } from "../interop_audit.ts";
import {
  assertSupportedLaunchMessageType,
  assertSupportedLaunchVersion,
  rejectDeploymentBindingMissing,
  rejectDeploymentMismatch,
  rejectLoginStateExpired,
  rejectLoginStateMissing,
  rejectLoginStateUsed,
  rejectSignatureValidationFailed,
  requireBaselineStringClaim,
} from "./launch_support_matrix.ts";
import { resolveLaunchTarget } from "./launch_target_resolution.ts";
import { resolveLtiProfileForDeployment } from "./profile_resolution.ts";
import { verifyIdTokenWithJwksRetry } from "./id_token_verification.ts";
import { formatLmsLabel, resolveBindingJwksUrl } from "./platform_binding.ts";
import { targetLinkUrisMatch } from "./target_link_uri.ts";
import { createOpaqueToken, loadJwks } from "./token_support.ts";
import type { ValidatedLaunch } from "./types.ts";

const CLAIM_MESSAGE_TYPE =
  "https://purl.imsglobal.org/spec/lti/claim/message_type";
const CLAIM_VERSION = "https://purl.imsglobal.org/spec/lti/claim/version";
const CLAIM_DEPLOYMENT_ID =
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const CLAIM_TARGET_LINK_URI =
  "https://purl.imsglobal.org/spec/lti/claim/target_link_uri";
const CLAIM_RESOURCE_LINK =
  "https://purl.imsglobal.org/spec/lti/claim/resource_link";
const CLAIM_CONTEXT = "https://purl.imsglobal.org/spec/lti/claim/context";
const CLAIM_CUSTOM = "https://purl.imsglobal.org/spec/lti/claim/custom";
const CLAIM_ROLES = "https://purl.imsglobal.org/spec/lti/claim/roles";
const CLAIM_LAUNCH_PRESENTATION =
  "https://purl.imsglobal.org/spec/lti/claim/launch_presentation";

export async function validateLaunchRequest(input: {
  repository: PackageReviewRepository;
  state: string;
  idToken: string;
  now?: () => Date;
  createOpaqueToken?: () => string;
  loadJwks?: (url: string) => Promise<JSONWebKeySet>;
}): Promise<ValidatedLaunch> {
  const now = input.now ?? (() => new Date());
  const nextOpaqueToken = input.createOpaqueToken ?? createOpaqueToken;
  const loadLaunchJwks = input.loadJwks ?? loadJwks;
  const state = requireTrimmedValue(input.state, "Launch state is required.");
  const idToken = requireTrimmedValue(
    input.idToken,
    "Launch id_token is required.",
  );
  const loginState = await input.repository.getLoginStateByState(state);

  if (!loginState) {
    rejectLoginStateMissing(state);
  }

  if (loginState.usedAt !== null) {
    rejectLoginStateUsed(state);
  }

  if (Date.parse(loginState.expiresAt) <= now().getTime()) {
    rejectLoginStateExpired(state);
  }

  const deployment = await input.repository.getDeploymentByBinding({
    lms: loginState.lms,
    issuer: loginState.issuer,
    clientId: loginState.clientId,
    deploymentId: loginState.deploymentId,
  });

  if (!deployment?.binding) {
    rejectDeploymentBindingMissing({
      lmsLabel: formatLmsLabel(loginState.lms),
      issuer: loginState.issuer,
      clientId: loginState.clientId,
      deploymentId: loginState.deploymentId,
    });
  }

  let payload: Awaited<ReturnType<typeof verifyIdTokenWithJwksRetry>>;

  try {
    payload = await verifyIdTokenWithJwksRetry({
      idToken,
      jwksUrl: resolveBindingJwksUrl(deployment.binding),
      issuer: loginState.issuer,
      audience: loginState.clientId,
      now,
      loadJwks: loadLaunchJwks,
      onRetry: async () => {
        const ltiProfile = await resolveLtiProfileForDeployment({
          repository: input.repository,
          deployment,
        });

        await recordInteropPathUsed({
          repository: input.repository,
          scope: "launch",
          path: "jwks_refetch",
          actorType: "platform",
          deploymentRecordId: deployment.id,
          packageVersionId: deployment.enabledPackageVersionId,
          summary: "Lantern refetched platform JWKS during launch validation.",
          detail: {
            deploymentSlug: deployment.slug,
            issuer: loginState.issuer,
            clientId: loginState.clientId,
            deploymentId: loginState.deploymentId,
          },
          ltiProfile,
        });
      },
    });
  } catch {
    rejectSignatureValidationFailed();
  }

  validateLtiAudience({
    aud: payload.aud,
    azp: payload.azp,
    clientId: loginState.clientId,
    subject: "Launch",
  });

  const deploymentId = requireStringClaim(
    payload[CLAIM_DEPLOYMENT_ID],
    "Launch deployment_id is required.",
  );
  const targetLinkUri = requireStringClaim(
    payload[CLAIM_TARGET_LINK_URI],
    "Launch target_link_uri is required.",
  );
  const nonce = requireStringClaim(payload.nonce, "Launch nonce is required.");
  const messageType = requireStringClaim(
    payload[CLAIM_MESSAGE_TYPE],
    "Launch message_type is required.",
  );
  const version = requireStringClaim(
    payload[CLAIM_VERSION],
    "Launch LTI version is required.",
  );

  if (deploymentId !== loginState.deploymentId) {
    rejectDeploymentMismatch({
      field: "deployment_id",
      target: "saved login state",
    });
  }

  if (
    !targetLinkUrisMatch({
      expected: loginState.targetLinkUri,
      actual: targetLinkUri,
    })
  ) {
    rejectDeploymentMismatch({
      field: "target_link_uri",
      target: "saved login state",
    });
  }

  if (nonce !== loginState.nonce) {
    rejectDeploymentMismatch({
      field: "nonce",
      target: "saved login state",
    });
  }

  assertSupportedLaunchMessageType(messageType);
  assertSupportedLaunchVersion(version);

  if (deploymentId !== deployment.binding.deploymentId) {
    rejectDeploymentMismatch({
      field: "deployment_id",
      target: `saved ${deployment.binding.lms} deployment binding`,
    });
  }

  const resourceLink = requireRecordClaim(
    payload[CLAIM_RESOURCE_LINK],
    "Launch resource_link claim is required.",
  );
  const resourceLinkId = requireStringClaim(
    resourceLink.id,
    "Launch resource_link.id is required.",
  );
  const context = readClaimRecord(payload[CLAIM_CONTEXT]);
  const contextId = requireBaselineStringClaim(context?.id, "context.id");
  const resolvedLaunch = await resolveLaunchTarget({
    repository: input.repository,
    deployment,
    resourceLinkId,
    contextId,
    customClaim: payload[CLAIM_CUSTOM],
    now,
  });
  const consumedState = await input.repository.consumeLoginState({
    state,
    usedAt: now().toISOString(),
  });
  const launchPresentation = optionalRecordClaim(
    payload[CLAIM_LAUNCH_PRESENTATION],
    "Launch launch_presentation claim must be an object when provided.",
  );
  const userId = requireStringClaim(payload.sub, "Launch subject is required.");
  const userDisplayName = resolveLaunchUserDisplayName(payload);
  const userEmail = optionalStringClaim(payload.email);
  const userLogin = optionalStringClaim(payload.preferred_username);

  return {
    lms: deployment.binding.lms,
    internalDeploymentId: deployment.id,
    internalDeploymentSlug: deployment.slug,
    appId: resolvedLaunch.packageVersion.appId,
    packageVersionId: resolvedLaunch.packageVersion.id,
    packageVersion: resolvedLaunch.packageVersion.version,
    contentPath: resolvedLaunch.contentPath,
    attemptId: `attempt-${nextOpaqueToken()}`,
    userId,
    userDisplayName,
    userEmail,
    userLogin,
    userRole: resolveUserRole(payload[CLAIM_ROLES]),
    resourceLinkId,
    resourceLinkTitle: optionalStringClaim(resourceLink.title),
    contextId,
    contextTitle: optionalStringClaim(context?.title),
    targetLinkUri,
    returnUrl: optionalStringClaim(launchPresentation?.return_url),
    activityId: resolvedLaunch.activityId,
    services: parseLaunchServiceClaims(payload),
    issuedAt: now().toISOString(),
    canvasEnvironment: consumedState.canvasEnvironment,
    issuer: consumedState.issuer,
    clientId: consumedState.clientId,
    deploymentId: consumedState.deploymentId,
  };
}

function readClaimRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function resolveLaunchUserDisplayName(
  payload: Record<string, unknown>,
): string | null {
  const explicitName = optionalStringClaim(payload.name);

  if (explicitName !== null) {
    return explicitName;
  }

  const nameParts = [
    optionalStringClaim(payload.given_name),
    optionalStringClaim(payload.family_name),
  ].filter((value): value is string => value !== null);

  return nameParts.length === 0 ? null : nameParts.join(" ");
}
