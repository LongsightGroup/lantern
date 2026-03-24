import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose";
import type { UserRole } from "../../sdk/app-sdk.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  LaunchAssignmentAndGradeServices,
  LaunchNamesAndRolesService,
  LaunchServiceClaims,
  RuntimeSessionRecord,
  ValidatedLaunch,
} from "./types.ts";
import { resolveCanvasPlatform } from "./canvas_platform.ts";

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
const CLAIM_ROLES = "https://purl.imsglobal.org/spec/lti/claim/roles";
const CLAIM_LAUNCH_PRESENTATION =
  "https://purl.imsglobal.org/spec/lti/claim/launch_presentation";
const CLAIM_AGS_ENDPOINT =
  "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint";
const CLAIM_NRPS_SERVICE =
  "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice";
const RUNTIME_SESSION_TTL_MS = 10 * 60 * 1000;

export async function validateLaunchRequest(input: {
  repository: PackageReviewRepository;
  state: string;
  idToken: string;
  now?: () => Date;
  createOpaqueToken?: () => string;
  loadJwks?: (url: string) => Promise<JSONWebKeySet>;
}): Promise<ValidatedLaunch> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const loadJwks = input.loadJwks ?? defaultLoadJwks;
  const state = requireTrimmedValue(input.state, "Launch state is required.");
  const idToken = requireTrimmedValue(
    input.idToken,
    "Launch id_token is required.",
  );
  const loginState = await input.repository.getLoginStateByState(state);

  if (!loginState) {
    throw new Error(`Login state ${state} was not found.`);
  }

  if (loginState.usedAt !== null) {
    throw new Error(`Login state ${state} has already been used.`);
  }

  if (Date.parse(loginState.expiresAt) <= now().getTime()) {
    throw new Error(`Login state ${state} has expired.`);
  }

  const platform = resolveCanvasPlatform(loginState.issuer);
  const jwks = await loadJwks(platform.jwksUrl);
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

  try {
    const verified = await jwtVerify(
      idToken,
      createLocalJWKSet(jwks),
      {
        issuer: loginState.issuer,
        audience: loginState.clientId,
        currentDate: now(),
      },
    );

    payload = verified.payload;
  } catch {
    throw new Error("Launch id_token signature or issuer validation failed.");
  }

  validateAudience(payload.aud, payload.azp, loginState.clientId);

  const deploymentId = requireStringClaim(
    payload[CLAIM_DEPLOYMENT_ID],
    "Launch deployment_id is required.",
  );
  const targetLinkUri = requireStringClaim(
    payload[CLAIM_TARGET_LINK_URI],
    "Launch target_link_uri is required.",
  );
  const nonce = requireStringClaim(
    payload.nonce,
    "Launch nonce is required.",
  );
  const messageType = requireStringClaim(
    payload[CLAIM_MESSAGE_TYPE],
    "Launch message_type is required.",
  );
  const version = requireStringClaim(
    payload[CLAIM_VERSION],
    "Launch LTI version is required.",
  );

  if (deploymentId !== loginState.deploymentId) {
    throw new Error(
      "Launch deployment_id did not match the saved login state.",
    );
  }

  if (targetLinkUri !== loginState.targetLinkUri) {
    throw new Error(
      "Launch target_link_uri did not match the saved login state.",
    );
  }

  if (nonce !== loginState.nonce) {
    throw new Error("Launch nonce did not match the saved login state.");
  }

  if (messageType !== "LtiResourceLinkRequest") {
    throw new Error(`Unsupported LTI message type ${messageType}.`);
  }

  if (version !== "1.3.0") {
    throw new Error(`Unsupported LTI version ${version}.`);
  }

  const deployment = await input.repository.getDeploymentByBinding({
    issuer: loginState.issuer,
    clientId: loginState.clientId,
    deploymentId,
  });

  if (!deployment?.binding) {
    throw new Error(
      `Canvas deployment ${loginState.clientId} / ${deploymentId} was not found for issuer ${loginState.issuer}.`,
    );
  }

  if (deployment.enabledPackageVersionId === null) {
    throw new Error(
      `Deployment ${deployment.slug} does not have an approved pinned package version.`,
    );
  }

  const packageVersion = await input.repository.getPackageVersionById(
    deployment.enabledPackageVersionId,
  );

  if (!packageVersion) {
    throw new Error(
      `Pinned package version id ${deployment.enabledPackageVersionId} was not found.`,
    );
  }

  if (packageVersion.approvalStatus !== "approved") {
    throw new Error(
      `Pinned package version ${packageVersion.appId}@${packageVersion.version} is not approved.`,
    );
  }

  const resourceLink = requireRecordClaim(
    payload[CLAIM_RESOURCE_LINK],
    "Launch resource_link claim is required.",
  );
  const resourceLinkId = requireStringClaim(
    resourceLink.id,
    "Launch resource_link.id is required.",
  );
  const context = requireRecordClaim(
    payload[CLAIM_CONTEXT],
    "Launch context claim is required for the governed runtime.",
  );
  const contextId = requireStringClaim(
    context.id,
    "Launch context.id is required for the governed runtime.",
  );
  const consumedState = await input.repository.consumeLoginState({
    state,
    usedAt: now().toISOString(),
  });
  const launchPresentation = asOptionalRecord(
    payload[CLAIM_LAUNCH_PRESENTATION],
  );
  const userId = requireStringClaim(payload.sub, "Launch subject is required.");

  return {
    internalDeploymentId: deployment.id,
    internalDeploymentSlug: deployment.slug,
    appId: packageVersion.appId,
    packageVersionId: packageVersion.id,
    packageVersion: packageVersion.version,
    attemptId: `attempt-${createOpaqueToken()}`,
    userId,
    userRole: resolveUserRole(payload[CLAIM_ROLES]),
    resourceLinkId,
    resourceLinkTitle: optionalStringClaim(resourceLink.title),
    contextId,
    contextTitle: optionalStringClaim(context.title),
    targetLinkUri,
    returnUrl: optionalStringClaim(launchPresentation?.return_url),
    activityId: resourceLinkId,
    services: parseLaunchServiceClaims(payload),
    issuedAt: now().toISOString(),
    canvasEnvironment: consumedState.canvasEnvironment,
    issuer: consumedState.issuer,
    clientId: consumedState.clientId,
    deploymentId: consumedState.deploymentId,
  };
}

export async function createRuntimeSession(input: {
  repository: PackageReviewRepository;
  launch: ValidatedLaunch;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<RuntimeSessionRecord> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const packageVersion = await input.repository.getPackageVersionById(
    input.launch.packageVersionId,
  );

  if (!packageVersion) {
    throw new Error(
      `Pinned package version id ${input.launch.packageVersionId} was not found.`,
    );
  }

  if (packageVersion.approvalStatus !== "approved") {
    throw new Error(
      `Pinned package version ${packageVersion.appId}@${packageVersion.version} is not approved.`,
    );
  }

  const createdAt = now();
  const attempt = await input.repository.createAttempt({
    attemptId: input.launch.attemptId,
    deploymentRecordId: input.launch.internalDeploymentId,
    deploymentSlug: input.launch.internalDeploymentSlug,
    appId: packageVersion.appId,
    packageVersionId: packageVersion.id,
    packageVersion: packageVersion.version,
    userId: input.launch.userId,
    userRole: input.launch.userRole,
    contextId: requireTrimmedValue(
      input.launch.contextId ?? "",
      "Launch context.id is required for the governed runtime.",
    ),
    resourceLinkId: input.launch.resourceLinkId,
    activityId: input.launch.activityId,
    status: "in_progress",
    completionState: null,
    startedAt: createdAt.toISOString(),
    finalizedAt: null,
  });

  return await input.repository.createRuntimeSession({
    sessionId: createOpaqueToken(),
    sessionToken: createOpaqueToken(),
    attemptId: attempt.attemptId,
    deploymentRecordId: input.launch.internalDeploymentId,
    deploymentSlug: input.launch.internalDeploymentSlug,
    appId: packageVersion.appId,
    packageVersionId: packageVersion.id,
    packageVersion: packageVersion.version,
    capabilities: packageVersion.capabilities,
    snapshotRoot: packageVersion.artifact.snapshotRoot,
    entrypointPath: packageVersion.artifact.entrypointPath,
    contentPath: resolveContentPath(packageVersion),
    services: input.launch.services,
    launch: {
      userRole: input.launch.userRole,
      courseId: requireTrimmedValue(
        input.launch.contextId ?? "",
        "Launch context.id is required for the governed runtime.",
      ),
      activityId: input.launch.activityId,
    },
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + RUNTIME_SESSION_TTL_MS)
      .toISOString(),
  });
}

async function defaultLoadJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Canvas JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

function resolveContentPath(packageVersion: PackageVersionRecord): string {
  const contentFiles = readStringArray(
    packageVersion.manifestJson.content_files,
  );
  const firstContentFile = contentFiles[0];

  if (!firstContentFile) {
    return `${packageVersion.artifact.snapshotRoot}/content/activity.json`;
  }

  return `${packageVersion.artifact.snapshotRoot}${
    trimLeadingSlash(firstContentFile)
  }`;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value.filter((item): item is string =>
    typeof item === "string"
  );

  return items.map((item) => item.trim()).filter((item) => item !== "");
}

function trimLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function validateAudience(
  aud: string | string[] | undefined,
  azp: unknown,
  clientId: string,
): void {
  const audiences = Array.isArray(aud) ? aud : aud ? [aud] : [];

  if (!audiences.includes(clientId)) {
    throw new Error(`Launch audience did not include client_id ${clientId}.`);
  }

  const authorizedParty = optionalStringClaim(azp);

  if (authorizedParty !== null && authorizedParty !== clientId) {
    throw new Error(`Launch azp did not match client_id ${clientId}.`);
  }

  if (audiences.length > 1 && authorizedParty === null) {
    throw new Error("Launch azp is required when aud has multiple values.");
  }
}

function resolveUserRole(value: unknown): UserRole {
  if (!Array.isArray(value)) {
    return "learner";
  }

  const roles = value.filter((item): item is string =>
    typeof item === "string"
  );

  if (roles.some((role) => role.includes("#Instructor"))) {
    return "instructor";
  }

  return "learner";
}

function requireRecordClaim(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function requireStringClaim(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function optionalStringClaim(value: unknown): string | null {
  if (typeof value !== "string") {
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

function parseLaunchServiceClaims(
  payload: Record<string, unknown>,
): LaunchServiceClaims {
  return {
    ags: parseAgsServiceClaim(asOptionalRecord(payload[CLAIM_AGS_ENDPOINT])),
    nrps: parseNrpsServiceClaim(asOptionalRecord(payload[CLAIM_NRPS_SERVICE])),
  };
}

function parseAgsServiceClaim(
  value: Record<string, unknown> | null,
): LaunchAssignmentAndGradeServices | null {
  if (value === null) {
    return null;
  }

  return {
    scope: readStringArray(value.scope),
    lineitemsUrl: optionalStringClaim(value.lineitems),
    lineitemUrl: optionalStringClaim(value.lineitem),
  };
}

function parseNrpsServiceClaim(
  value: Record<string, unknown> | null,
): LaunchNamesAndRolesService | null {
  if (value === null) {
    return null;
  }

  const contextMembershipsUrl = requireStringClaim(
    value.context_memberships_url,
    "Launch namesroleservice.context_memberships_url is required.",
  );

  return {
    contextMembershipsUrl,
    serviceVersions: readStringArray(value.service_versions),
  };
}

function encodeBase64Url(bytes: Uint8Array): string {
  const chunk = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  return btoa(chunk).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}
