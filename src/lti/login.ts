import type { PackageReviewRepository } from "../package_review/repository.ts";
import { getLtiProfileDefinition, type ResolvedLtiProfile } from "./profile.ts";
import { resolveLtiProfileForDeployment } from "./profile_resolution.ts";
import { buildLanternTargetLinkUri } from "./target_link_uri.ts";
import type { LoginStateRecord } from "./types.ts";
import { resolveAuthorizationEndpoint } from "./platform_binding.ts";

const LOGIN_STATE_TTL_MS = 5 * 60 * 1000;

export type LoginCompatibilityPath =
  | "opaque_login_hint_decode"
  | "opaque_lti_message_hint_decode"
  | "platform_default_launch_target";

export interface LoginRequest {
  iss: string;
  loginHint: string;
  targetLinkUri: string | null;
  clientId: string | null;
  deploymentId: string;
  ltiMessageHint: string | null;
}

export interface LoginRequestCompatibility {
  decodedLoginHint: string | null;
  decodedLtiMessageHint: string | null;
}

export interface LoginRedirectResult {
  location: string;
  loginState: LoginStateRecord;
  deploymentRecordId: number;
  deploymentSlug: string;
  packageVersionId: number | null;
  ltiProfile: ResolvedLtiProfile;
  compatibilityPathsUsed: LoginCompatibilityPath[];
}

export async function createLoginRedirect(input: {
  repository: PackageReviewRepository;
  loginRequest: LoginRequest;
  loginCompatibility?: LoginRequestCompatibility;
  appOrigin?: string;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<LoginRedirectResult> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const loginRequest = normalizeLoginRequest(input.loginRequest);
  const loginCompatibility = normalizeLoginRequestCompatibility(
    input.loginCompatibility,
  );
  let deployment;

  try {
    deployment = await input.repository.getDeploymentByPlatformIdentity({
      issuer: loginRequest.iss,
      clientId: loginRequest.clientId,
      deploymentId: loginRequest.deploymentId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Multiple deployments matched issuer") &&
      !error.message.includes("must send client_id")
    ) {
      throw new Error(
        "Choose one supported LMS deployment. Resolve the duplicate LMS bindings before login can continue.",
      );
    }

    throw error;
  }

  if (!deployment) {
    if (loginRequest.clientId !== null) {
      deployment = await input.repository.completePendingCanvasBinding({
        issuer: loginRequest.iss,
        clientId: loginRequest.clientId,
        deploymentId: loginRequest.deploymentId,
      });
    }
  }

  if (!deployment?.binding) {
    if (loginRequest.clientId === null) {
      throw new Error(
        `Deployment ${loginRequest.deploymentId} was not found for issuer ${loginRequest.iss}. Include client_id in the login request or save a matching LMS binding before login can continue.`,
      );
    }

    throw new Error(
      `Deployment ${loginRequest.clientId} / ${loginRequest.deploymentId} was not found for issuer ${loginRequest.iss}.`,
    );
  }

  const binding = deployment.binding;
  const ltiProfile = await resolveLtiProfileForDeployment({
    repository: input.repository,
    deployment,
  });
  const behavior = getLtiProfileDefinition(ltiProfile.id).behavior;
  const compatibilityPathsUsed: LoginCompatibilityPath[] = [];
  const loginHint = resolveOpaqueLoginCompatibility({
    field: "login_hint",
    rawValue: loginRequest.loginHint,
    decodedValue: loginCompatibility.decodedLoginHint,
    allowDecode: behavior.decodeOpaqueHints,
    path: "opaque_login_hint_decode",
    compatibilityPathsUsed,
  });
  const ltiMessageHint = resolveOptionalOpaqueLoginCompatibility({
    field: "lti_message_hint",
    rawValue: loginRequest.ltiMessageHint,
    decodedValue: loginCompatibility.decodedLtiMessageHint,
    allowDecode: behavior.decodeOpaqueHints,
    path: "opaque_lti_message_hint_decode",
    compatibilityPathsUsed,
  });
  const createdAt = now();
  const targetLinkUri = resolveLoginTargetLinkUri({
    targetLinkUri: loginRequest.targetLinkUri,
    lms: binding.lms,
    appOrigin: input.appOrigin,
    allowPlatformDefaultLaunchTarget: behavior.allowPlatformDefaultLaunchTarget,
  });

  if (targetLinkUri.usedCompatibilityPath) {
    compatibilityPathsUsed.push("platform_default_launch_target");
  }

  const loginState = await input.repository.createLoginState({
    lms: binding.lms,
    state: createOpaqueToken(),
    nonce: createOpaqueToken(),
    canvasEnvironment: binding.lms === "canvas"
      ? binding.canvasEnvironment
      : null,
    issuer: binding.issuer,
    clientId: binding.clientId,
    deploymentId: binding.deploymentId,
    loginHint,
    targetLinkUri: targetLinkUri.value,
    ltiMessageHint,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + LOGIN_STATE_TTL_MS).toISOString(),
    usedAt: null,
  });
  const location = new URL(resolveAuthorizationEndpoint(binding));

  location.searchParams.set("client_id", loginState.clientId);
  location.searchParams.set("login_hint", loginState.loginHint);
  location.searchParams.set("nonce", loginState.nonce);
  location.searchParams.set("redirect_uri", loginState.targetLinkUri);
  location.searchParams.set("response_mode", "form_post");
  location.searchParams.set("response_type", "id_token");
  location.searchParams.set("scope", "openid");
  location.searchParams.set("state", loginState.state);

  if (loginState.ltiMessageHint !== null) {
    location.searchParams.set("lti_message_hint", loginState.ltiMessageHint);
  }

  return {
    location: location.toString(),
    loginState,
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: deployment.enabledPackageVersionId,
    ltiProfile,
    compatibilityPathsUsed,
  };
}

function normalizeLoginRequest(request: LoginRequest): LoginRequest {
  return {
    iss: requireTrimmedValue(request.iss, "LTI issuer is required."),
    loginHint: requireTrimmedValue(
      request.loginHint,
      "LTI login_hint is required.",
    ),
    targetLinkUri: normalizeOptionalValue(request.targetLinkUri),
    clientId: normalizeOptionalValue(request.clientId),
    deploymentId: requireTrimmedValue(
      request.deploymentId,
      "LTI deployment_id is required.",
    ),
    ltiMessageHint: normalizeOptionalValue(request.ltiMessageHint),
  };
}

function normalizeLoginRequestCompatibility(
  compatibility: LoginRequestCompatibility | undefined,
): LoginRequestCompatibility {
  return {
    decodedLoginHint: normalizeOptionalValue(
      compatibility?.decodedLoginHint ?? null,
    ),
    decodedLtiMessageHint: normalizeOptionalValue(
      compatibility?.decodedLtiMessageHint ?? null,
    ),
  };
}

function resolveOpaqueLoginCompatibility(input: {
  field: "login_hint" | "lti_message_hint";
  rawValue: string;
  decodedValue: string | null;
  allowDecode: boolean;
  path: LoginCompatibilityPath;
  compatibilityPathsUsed: LoginCompatibilityPath[];
}): string {
  if (input.decodedValue === null || input.decodedValue === input.rawValue) {
    return input.rawValue;
  }

  if (!input.allowDecode) {
    throw new Error(
      `The active LTI profile does not allow opaque ${input.field} compatibility decoding.`,
    );
  }

  input.compatibilityPathsUsed.push(input.path);
  return input.decodedValue;
}

function resolveOptionalOpaqueLoginCompatibility(input: {
  field: "lti_message_hint";
  rawValue: string | null;
  decodedValue: string | null;
  allowDecode: boolean;
  path: LoginCompatibilityPath;
  compatibilityPathsUsed: LoginCompatibilityPath[];
}): string | null {
  if (input.rawValue === null) {
    return null;
  }

  return resolveOpaqueLoginCompatibility({
    field: input.field,
    rawValue: input.rawValue,
    decodedValue: input.decodedValue,
    allowDecode: input.allowDecode,
    path: input.path,
    compatibilityPathsUsed: input.compatibilityPathsUsed,
  });
}

function resolveLoginTargetLinkUri(input: {
  targetLinkUri: string | null;
  lms: LoginStateRecord["lms"];
  appOrigin: string | undefined;
  allowPlatformDefaultLaunchTarget: boolean;
}): {
  value: string;
  usedCompatibilityPath: boolean;
} {
  if (input.targetLinkUri !== null) {
    return {
      value: input.targetLinkUri,
      usedCompatibilityPath: false,
    };
  }

  if (input.lms === "canvas") {
    throw new Error(
      "LTI target_link_uri is required for Canvas login because Canvas launches use more than one Lantern callback route.",
    );
  }

  if (!input.allowPlatformDefaultLaunchTarget) {
    throw new Error(
      "The active LTI profile requires target_link_uri for this login.",
    );
  }

  return {
    value: buildLanternTargetLinkUri("launch", input.appOrigin),
    usedCompatibilityPath: true,
  };
}

function normalizeOptionalValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requireTrimmedValue(value: string | null, message: string): string {
  if (value === null) {
    throw new Error(message);
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(message);
  }

  return trimmed;
}

function defaultOpaqueToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  const chunk = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(
    "",
  );

  return btoa(chunk).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}
