import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose";
import type { UserRole } from "../../sdk/app-sdk.ts";
import type {
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
} from "../package_review/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import {
  type DeepLinkingAcceptType,
  type DeepLinkingPresentationDocumentTarget,
  type DeepLinkingSessionRecord,
  type DeepLinkingSettings,
  LTI_ASSIGNMENT_SELECTION_PLACEMENT,
  LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
  type ValidatedDeepLinkingRequest,
} from "./types.ts";
import { resolveCanvasPlatform } from "./canvas_platform.ts";

const CLAIM_MESSAGE_TYPE =
  "https://purl.imsglobal.org/spec/lti/claim/message_type";
const CLAIM_VERSION = "https://purl.imsglobal.org/spec/lti/claim/version";
const CLAIM_DEPLOYMENT_ID =
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const CLAIM_TARGET_LINK_URI =
  "https://purl.imsglobal.org/spec/lti/claim/target_link_uri";
const CLAIM_CONTEXT = "https://purl.imsglobal.org/spec/lti/claim/context";
const CLAIM_ROLES = "https://purl.imsglobal.org/spec/lti/claim/roles";
const CLAIM_DEEP_LINKING_SETTINGS =
  "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings";
const DEEP_LINKING_ROUTE_PATH = "/lti/deep-linking";
const DEEP_LINKING_SESSION_TTL_MS = 10 * 60 * 1000;

export async function validateDeepLinkingRequest(input: {
  repository: PackageReviewRepository;
  state: string;
  idToken: string;
  now?: () => Date;
  loadJwks?: (url: string) => Promise<JSONWebKeySet>;
}): Promise<ValidatedDeepLinkingRequest> {
  const now = input.now ?? (() => new Date());
  const loadJwks = input.loadJwks ?? defaultLoadJwks;
  const state = requireTrimmedValue(
    input.state,
    "Deep Linking state is required.",
  );
  const idToken = requireTrimmedValue(
    input.idToken,
    "Deep Linking id_token is required.",
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
    throw new Error(
      "Deep Linking id_token signature or issuer validation failed.",
    );
  }

  validateAudience(payload.aud, payload.azp, loginState.clientId);

  const deploymentId = requireStringClaim(
    payload[CLAIM_DEPLOYMENT_ID],
    "Deep Linking deployment_id is required.",
  );
  const targetLinkUri = requireStringClaim(
    payload[CLAIM_TARGET_LINK_URI],
    "Deep Linking target_link_uri is required.",
  );
  const nonce = requireStringClaim(
    payload.nonce,
    "Deep Linking nonce is required.",
  );
  const messageType = requireStringClaim(
    payload[CLAIM_MESSAGE_TYPE],
    "Deep Linking message_type is required.",
  );
  const version = requireStringClaim(
    payload[CLAIM_VERSION],
    "Deep Linking LTI version is required.",
  );

  if (deploymentId !== loginState.deploymentId) {
    throw new Error(
      "Deep Linking deployment_id did not match the saved login state.",
    );
  }

  if (targetLinkUri !== loginState.targetLinkUri) {
    throw new Error(
      "Deep Linking target_link_uri did not match the saved login state.",
    );
  }

  requireDeepLinkingRouteTarget(targetLinkUri);

  if (nonce !== loginState.nonce) {
    throw new Error("Deep Linking nonce did not match the saved login state.");
  }

  if (messageType !== LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE) {
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

  const settings = parseDeepLinkingSettingsClaim(
    payload[CLAIM_DEEP_LINKING_SETTINGS],
  );
  const context = optionalRecordClaim(
    payload[CLAIM_CONTEXT],
    "Deep Linking context claim must be an object when provided.",
  );
  const consumedState = await input.repository.consumeLoginState({
    state,
    usedAt: now().toISOString(),
  });

  return {
    internalDeploymentId: deployment.id,
    internalDeploymentSlug: deployment.slug,
    appId: deployment.appId,
    userId: optionalStringClaim(payload.sub),
    userRole: resolveUserRole(payload[CLAIM_ROLES]),
    contextId: optionalStringClaim(context?.id),
    contextTitle: optionalStringClaim(context?.title),
    targetLinkUri,
    deepLinkReturnUrl: settings.deepLinkReturnUrl,
    data: settings.data,
    placement: LTI_ASSIGNMENT_SELECTION_PLACEMENT,
    settings: {
      acceptTypes: settings.acceptTypes,
      acceptMultiple: settings.acceptMultiple,
      acceptPresentationDocumentTargets:
        settings.acceptPresentationDocumentTargets,
      acceptLineItem: settings.acceptLineItem,
    },
    issuedAt: now().toISOString(),
    canvasEnvironment: consumedState.canvasEnvironment,
    issuer: consumedState.issuer,
    clientId: consumedState.clientId,
    deploymentId: consumedState.deploymentId,
  };
}

export async function createDeepLinkingSession(input: {
  repository: PackageReviewRepository;
  request: ValidatedDeepLinkingRequest;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<DeepLinkingSessionRecord> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const createdAt = now();

  return await input.repository.createDeepLinkingSession({
    sessionId: createOpaqueToken(),
    sessionToken: createOpaqueToken(),
    deploymentRecordId: input.request.internalDeploymentId,
    deploymentSlug: input.request.internalDeploymentSlug,
    appId: input.request.appId,
    userId: input.request.userId,
    userRole: input.request.userRole,
    contextId: input.request.contextId,
    contextTitle: input.request.contextTitle,
    deepLinkReturnUrl: input.request.deepLinkReturnUrl,
    data: input.request.data,
    placement: input.request.placement,
    acceptTypes: [...input.request.settings.acceptTypes],
    acceptMultiple: input.request.settings.acceptMultiple,
    acceptPresentationDocumentTargets: [
      ...input.request.settings.acceptPresentationDocumentTargets,
    ],
    acceptLineItem: input.request.settings.acceptLineItem,
    selection: null,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + DEEP_LINKING_SESSION_TTL_MS)
      .toISOString(),
  });
}

export async function requireAuthorizedDeepLinkingSession(input: {
  repository: PackageReviewRepository;
  sessionId: string;
  token: string;
  now?: () => Date;
}): Promise<DeepLinkingSessionRecord> {
  const sessionId = requireTrimmedValue(
    input.sessionId,
    "Deep Linking session id is required.",
  );
  const token = requireTrimmedValue(
    input.token,
    "Deep Linking session token is required.",
  );
  const session = await input.repository.getDeepLinkingSessionById(sessionId);

  if (!session) {
    throw new Error(`Deep Linking session ${sessionId} was not found.`);
  }

  authorizeDeepLinkingSession({
    token,
    expected: session,
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  return session;
}

export function authorizeDeepLinkingSession(input: {
  token: string;
  expected: DeepLinkingSessionRecord;
  now?: () => Date;
}): void {
  const now = input.now ?? (() => new Date());
  const token = requireTrimmedValue(
    input.token,
    "Deep Linking session token is required.",
  );

  if (Date.parse(input.expected.expiresAt) <= now().getTime()) {
    throw new Error(
      `Deep Linking session ${input.expected.sessionId} has expired.`,
    );
  }

  if (token !== input.expected.sessionToken) {
    throw new Error(
      `Deep Linking session token did not match ${input.expected.sessionId}.`,
    );
  }
}

export async function listDeepLinkingResources(input: {
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
}): Promise<DeepLinkingResourceOption[]> {
  return await input.repository.listDeepLinkingResourceOptions(
    input.session.appId,
  );
}

export async function saveDeepLinkingSessionSelection(input: {
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
  selectionValue: string;
}): Promise<{
  session: DeepLinkingSessionRecord;
  selection: DeepLinkingResourceSelection;
}> {
  const resources = await listDeepLinkingResources({
    repository: input.repository,
    session: input.session,
  });
  const selection = normalizeDeepLinkingSelectionInput({
    selectionValue: input.selectionValue,
    resources,
  });
  const session = await input.repository.updateDeepLinkingSessionSelection({
    sessionId: input.session.sessionId,
    selection: {
      packageVersionId: selection.packageVersionId,
      packageVersion: selection.packageVersion,
      activityId: selection.activityId,
      contentPath: selection.contentPath,
    },
  });

  return {
    session,
    selection,
  };
}

export function buildDeepLinkingSelectionValue(input: {
  packageVersionId: number;
  contentPath: string;
}): string {
  return JSON.stringify({
    packageVersionId: input.packageVersionId,
    contentPath: normalizeContentPath(input.contentPath),
  });
}

export function resolveDeepLinkingSelection(input: {
  session: DeepLinkingSessionRecord;
  resources: DeepLinkingResourceOption[];
}): DeepLinkingResourceSelection | null {
  const sessionSelection = input.session.selection;

  if (sessionSelection === null) {
    return null;
  }

  const resource = input.resources.find((candidate) =>
    candidate.packageVersionId === sessionSelection.packageVersionId &&
    candidate.contentPath === sessionSelection.contentPath
  );

  if (!resource) {
    return null;
  }

  return {
    packageVersionId: resource.packageVersionId,
    packageVersion: resource.packageVersion,
    packageTitle: resource.packageTitle,
    activityId: resource.activityId,
    contentPath: resource.contentPath,
    contentTitle: resource.contentTitle,
  };
}

async function defaultLoadJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Canvas JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

function requireDeepLinkingRouteTarget(targetLinkUri: string): void {
  let url: URL;

  try {
    url = new URL(targetLinkUri);
  } catch {
    throw new Error(
      "Deep Linking target_link_uri must be an absolute Lantern URL.",
    );
  }

  if (url.pathname !== DEEP_LINKING_ROUTE_PATH || url.search !== "") {
    throw new Error(
      `Unsupported Deep Linking target_link_uri ${targetLinkUri}.`,
    );
  }
}

function parseDeepLinkingSettingsClaim(value: unknown): DeepLinkingSettings & {
  deepLinkReturnUrl: string;
  data: string | null;
} {
  const settings = requireRecordClaim(
    value,
    "Deep Linking settings claim is required.",
  );
  const acceptTypes = parseAcceptTypes(settings.accept_types);

  return {
    acceptTypes,
    acceptMultiple: requireOptionalBooleanClaim(
      settings.accept_multiple,
      "Deep Linking accept_multiple must be a boolean when provided.",
      false,
    ),
    acceptPresentationDocumentTargets: parsePresentationDocumentTargets(
      settings.accept_presentation_document_targets,
    ),
    acceptLineItem: requireOptionalBooleanClaim(
      settings.accept_lineitem,
      "Deep Linking accept_lineitem must be a boolean when provided.",
      false,
    ),
    deepLinkReturnUrl: requireStringClaim(
      settings.deep_link_return_url,
      "Deep Linking return URL is required.",
    ),
    data: optionalTypedStringClaim(
      settings.data,
      "Deep Linking data must be a string when provided.",
    ),
  };
}

function parseAcceptTypes(value: unknown): DeepLinkingAcceptType[] {
  const items = readStringArray(value);

  if (items.length === 0) {
    throw new Error("Deep Linking accept_types must include ltiResourceLink.");
  }

  const unsupported = items.filter((item) => item !== "ltiResourceLink");

  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported Deep Linking accept_types: ${unsupported.join(", ")}.`,
    );
  }

  return ["ltiResourceLink"];
}

function parsePresentationDocumentTargets(
  value: unknown,
): DeepLinkingPresentationDocumentTarget[] {
  const items = readStringArray(value);

  if (items.length === 0) {
    return [];
  }

  const supported = new Set<DeepLinkingPresentationDocumentTarget>([
    "embed",
    "iframe",
    "window",
  ]);

  for (const item of items) {
    if (!supported.has(item as DeepLinkingPresentationDocumentTarget)) {
      throw new Error(
        `Unsupported Deep Linking presentation target ${item}.`,
      );
    }
  }

  return Array.from(
    new Set(items),
  ) as DeepLinkingPresentationDocumentTarget[];
}

function normalizeDeepLinkingSelectionInput(input: {
  selectionValue: string;
  resources: DeepLinkingResourceOption[];
}): DeepLinkingResourceSelection {
  const selectionValue = requireTrimmedValue(
    input.selectionValue,
    "Choose one reviewed resource before continuing.",
  );
  let payload: unknown;

  try {
    payload = JSON.parse(selectionValue);
  } catch {
    throw new Error("Deep Linking selection payload was invalid.");
  }

  const record = requireRecordClaim(
    payload,
    "Deep Linking selection payload was invalid.",
  );
  const packageVersionId = parseSelectionPackageVersionId(
    record.packageVersionId,
  );
  const contentPath = normalizeContentPath(
    requireStringClaim(
      record.contentPath,
      "Deep Linking selection content path is required.",
    ),
  );
  const resource = input.resources.find((candidate) =>
    candidate.packageVersionId === packageVersionId &&
    candidate.contentPath === contentPath
  );

  if (!resource) {
    throw new Error(
      `Deep Linking selection ${packageVersionId} ${contentPath} is not approved for this app.`,
    );
  }

  return {
    packageVersionId: resource.packageVersionId,
    packageVersion: resource.packageVersion,
    packageTitle: resource.packageTitle,
    activityId: resource.activityId,
    contentPath: resource.contentPath,
    contentTitle: resource.contentTitle,
  };
}

function parseSelectionPackageVersionId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  throw new Error("Deep Linking selection package version is required.");
}

function normalizeContentPath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function validateAudience(
  aud: string | string[] | undefined,
  azp: unknown,
  clientId: string,
): void {
  const audiences = Array.isArray(aud) ? aud : aud ? [aud] : [];

  if (!audiences.includes(clientId)) {
    throw new Error(
      `Deep Linking audience did not include client_id ${clientId}.`,
    );
  }

  const authorizedParty = optionalStringClaim(azp);

  if (authorizedParty !== null && authorizedParty !== clientId) {
    throw new Error(`Deep Linking azp did not match client_id ${clientId}.`);
  }

  if (audiences.length > 1 && authorizedParty === null) {
    throw new Error(
      "Deep Linking azp is required when aud has multiple values.",
    );
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value.filter((item): item is string =>
    typeof item === "string"
  );

  return items.map((item) => item.trim()).filter((item) => item !== "");
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

function optionalRecordClaim(
  value: unknown,
  message: string,
): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireStringClaim(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function optionalTypedStringClaim(
  value: unknown,
  message: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(message);
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function optionalStringClaim(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requireOptionalBooleanClaim(
  value: unknown,
  message: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new Error(message);
  }

  return value;
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

  return btoa(chunk).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}
