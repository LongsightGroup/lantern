import type { JSONWebKeySet } from "jose";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import { recordInteropPathUsed } from "../interop_audit.ts";
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
import { verifyIdTokenWithJwksRetry } from "./id_token_verification.ts";
import {
  assertLanternTargetLinkKind,
  resolveLanternDeepLinkingPlacement,
  targetLinkUrisMatch,
} from "./target_link_uri.ts";
import { formatLmsLabel, resolveBindingJwksUrl } from "./platform_binding.ts";
import { loadJwks } from "./token_support.ts";
import type {
  DeepLinkingAcceptType,
  DeepLinkingPresentationDocumentTarget,
  DeepLinkingSettings,
  LtiPlacement,
  ValidatedDeepLinkingRequest,
} from "./types.ts";
import { LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE } from "./types.ts";

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

  const deployment = await input.repository.getDeploymentByBinding({
    lms: loginState.lms,
    issuer: loginState.issuer,
    clientId: loginState.clientId,
    deploymentId: loginState.deploymentId,
  });

  if (!deployment?.binding) {
    throw new Error(
      `${
        formatLmsLabel(loginState.lms)
      } deployment ${loginState.clientId} / ${loginState.deploymentId} was not found for issuer ${loginState.issuer}.`,
    );
  }

  let payload: Awaited<ReturnType<typeof verifyIdTokenWithJwksRetry>>;

  try {
    payload = await verifyIdTokenWithJwksRetry({
      idToken,
      jwksUrl: resolveBindingJwksUrl(deployment.binding),
      issuer: loginState.issuer,
      audience: loginState.clientId,
      now,
      loadJwks: loadDeepLinkingJwks,
      onRetry: async () => {
        await recordInteropPathUsed({
          repository: input.repository,
          scope: "deep_linking",
          path: "jwks_refetch",
          actorType: "platform",
          deploymentRecordId: deployment?.id ?? null,
          packageVersionId: deployment?.enabledPackageVersionId ?? null,
          summary:
            "Lantern refetched platform JWKS during Deep Linking validation.",
          detail: {
            deploymentSlug: deployment?.slug ?? null,
            issuer: loginState.issuer,
            clientId: loginState.clientId,
            deploymentId: loginState.deploymentId,
          },
        });
      },
    });
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
  const placement = requireDeepLinkingRouteTarget(targetLinkUri);
  const nonce = resolveDeepLinkingNonce(payload);
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

  if (
    !targetLinkUrisMatch({
      expected: loginState.targetLinkUri,
      actual: targetLinkUri,
    })
  ) {
    throw new Error(
      "Deep Linking target_link_uri did not match the saved login state.",
    );
  }
  if (nonce.value !== loginState.nonce) {
    throw new Error("Deep Linking nonce did not match the saved login state.");
  }

  if (messageType !== LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE) {
    throw new Error(`Unsupported LTI message type ${messageType}.`);
  }

  if (version !== "1.3.0") {
    throw new Error(`Unsupported LTI version ${version}.`);
  }

  if (deploymentId !== deployment.binding.deploymentId) {
    throw new Error(
      "Deep Linking deployment_id did not match the saved deployment binding.",
    );
  }

  if (nonce.source === "jti") {
    await recordInteropPathUsed({
      repository: input.repository,
      scope: "deep_linking",
      path: "jti_nonce_bridge",
      actorType: "platform",
      deploymentRecordId: deployment.id,
      packageVersionId: deployment.enabledPackageVersionId,
      summary: "Lantern accepted jti as the Deep Linking nonce value.",
      detail: {
        deploymentSlug: deployment.slug,
        issuer: loginState.issuer,
        clientId: loginState.clientId,
        deploymentId: loginState.deploymentId,
      },
    });
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
    lms: deployment.binding.lms,
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
    placement,
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

function resolveDeepLinkingNonce(payload: Record<string, unknown>): {
  value: string;
  source: "nonce" | "jti";
} {
  const nonce = optionalStringClaim(payload.nonce);

  if (nonce !== null) {
    return {
      value: nonce,
      source: "nonce",
    };
  }

  const jti = optionalStringClaim(payload.jti);

  if (jti !== null) {
    return {
      value: jti,
      source: "jti",
    };
  }

  throw new Error("Deep Linking nonce is required.");
}

function requireDeepLinkingRouteTarget(targetLinkUri: string): LtiPlacement {
  assertLanternTargetLinkKind({
    targetLinkUri,
    kind: "deep_linking",
    message: `Unsupported Deep Linking target_link_uri ${targetLinkUri}.`,
  });

  const placement = resolveLanternDeepLinkingPlacement(targetLinkUri);

  if (placement === null) {
    throw new Error(
      `Unsupported Deep Linking placement in target_link_uri ${targetLinkUri}.`,
    );
  }

  return placement;
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
