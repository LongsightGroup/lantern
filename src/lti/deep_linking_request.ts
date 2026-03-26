import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import {
  optionalRecordClaim,
  optionalStringClaim,
  optionalTypedStringClaim,
  readStringArray,
  requireOptionalBooleanClaim,
  requireRecordClaim,
  requireStringClaim,
  requireTrimmedValue,
  resolveUserRole,
  validateLtiAudience,
} from "./claim_support.ts";
import { resolveCanvasPlatform } from "./canvas_platform.ts";
import { loadJwks } from "./token_support.ts";
import type {
  DeepLinkingAcceptType,
  DeepLinkingPresentationDocumentTarget,
  DeepLinkingSettings,
  ValidatedDeepLinkingRequest,
} from "./types.ts";
import {
  LTI_ASSIGNMENT_SELECTION_PLACEMENT,
  LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
} from "./types.ts";

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

export async function validateDeepLinkingRequest(input: {
  repository: PackageReviewRepository;
  state: string;
  idToken: string;
  now?: () => Date;
  loadJwks?: (url: string) => Promise<JSONWebKeySet>;
}): Promise<ValidatedDeepLinkingRequest> {
  const now = input.now ?? (() => new Date());
  const loadDeepLinkingJwks = input.loadJwks ?? loadJwks;
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

  if (loginState.lms !== "canvas" || loginState.canvasEnvironment === null) {
    throw new Error("Deep Linking is only supported for Canvas deployments.");
  }

  const platform = resolveCanvasPlatform(loginState.issuer);
  const jwks = await loadDeepLinkingJwks(platform.jwksUrl);
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

  try {
    const verified = await jwtVerify(idToken, createLocalJWKSet(jwks), {
      issuer: loginState.issuer,
      audience: loginState.clientId,
      currentDate: now(),
    });

    payload = verified.payload;
  } catch {
    throw new Error(
      "Deep Linking id_token signature or issuer validation failed.",
    );
  }

  validateLtiAudience({
    aud: payload.aud,
    azp: payload.azp,
    clientId: loginState.clientId,
    subject: "Deep Linking",
  });

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
    lms: "canvas",
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
    lms: "canvas",
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
    canvasEnvironment: loginState.canvasEnvironment,
    issuer: consumedState.issuer,
    clientId: consumedState.clientId,
    deploymentId: consumedState.deploymentId,
  };
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
      throw new Error(`Unsupported Deep Linking presentation target ${item}.`);
    }
  }

  return Array.from(new Set(items)) as DeepLinkingPresentationDocumentTarget[];
}
