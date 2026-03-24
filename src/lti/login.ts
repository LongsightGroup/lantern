import type { PackageReviewRepository } from "../package_review/repository.ts";
import type { LoginStateRecord } from "./types.ts";
import { resolveCanvasPlatform } from "./canvas_platform.ts";

const LOGIN_STATE_TTL_MS = 5 * 60 * 1000;

export interface CanvasLoginRequest {
  iss: string;
  loginHint: string;
  targetLinkUri: string;
  clientId: string;
  deploymentId: string;
  ltiMessageHint: string | null;
}

export interface LoginRedirectResult {
  location: string;
  loginState: LoginStateRecord;
}

export async function createLoginRedirect(input: {
  repository: PackageReviewRepository;
  loginRequest: CanvasLoginRequest;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<LoginRedirectResult> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const loginRequest = normalizeLoginRequest(input.loginRequest);
  const deployment = await input.repository.getDeploymentByBinding({
    issuer: loginRequest.iss,
    clientId: loginRequest.clientId,
    deploymentId: loginRequest.deploymentId,
  });

  if (!deployment?.binding) {
    throw new Error(
      `Canvas deployment ${loginRequest.clientId} / ${loginRequest.deploymentId} was not found for issuer ${loginRequest.iss}.`,
    );
  }

  const platform = resolveCanvasPlatform(loginRequest.iss);
  const createdAt = now();
  const loginState = await input.repository.createLoginState({
    state: createOpaqueToken(),
    nonce: createOpaqueToken(),
    canvasEnvironment: deployment.binding.canvasEnvironment,
    issuer: deployment.binding.issuer,
    clientId: deployment.binding.clientId,
    deploymentId: deployment.binding.deploymentId,
    loginHint: loginRequest.loginHint,
    targetLinkUri: loginRequest.targetLinkUri,
    ltiMessageHint: loginRequest.ltiMessageHint,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + LOGIN_STATE_TTL_MS).toISOString(),
    usedAt: null,
  });
  const location = new URL(platform.authorizationEndpoint);

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
  };
}

function normalizeLoginRequest(request: CanvasLoginRequest): CanvasLoginRequest {
  return {
    iss: requireTrimmedValue(request.iss, "Canvas issuer is required."),
    loginHint: requireTrimmedValue(
      request.loginHint,
      "Canvas login_hint is required.",
    ),
    targetLinkUri: requireTrimmedValue(
      request.targetLinkUri,
      "Canvas target_link_uri is required.",
    ),
    clientId: requireTrimmedValue(
      request.clientId,
      "Canvas client_id is required.",
    ),
    deploymentId: requireTrimmedValue(
      request.deploymentId,
      "Canvas deployment_id is required.",
    ),
    ltiMessageHint: normalizeOptionalValue(request.ltiMessageHint),
  };
}

function normalizeOptionalValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requireTrimmedValue(value: string, message: string): string {
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
  const chunk = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  return btoa(chunk).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
