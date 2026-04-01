import type { JSONWebKeySet } from "jose";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import { recordInteropPathUsed } from "../interop_audit.ts";
import {
  buildRejectionDetailRecord,
  type LtiBoundaryDenial,
  LtiBoundaryDenialError,
} from "./launch_rejection.ts";
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
  targetLinkUriUsesLanternDriftTolerance,
} from "./target_link_uri.ts";
import { getLtiProfileDefinition } from "./profile.ts";
import { resolveLtiProfileForDeployment } from "./profile_resolution.ts";
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

export type DeepLinkingRejectionCode =
  | "audience_mismatch"
  | "deployment_binding_missing"
  | "invalid_value"
  | "login_state_expired"
  | "login_state_missing"
  | "login_state_used"
  | "missing_required_value"
  | "nonce_bridge_not_allowed"
  | "request_mismatch"
  | "signature_validation_failed"
  | "target_link_uri_drift_not_allowed"
  | "unsupported_deep_linking_accept_type"
  | "unsupported_deep_linking_presentation_target"
  | "unsupported_lti_version"
  | "unsupported_message_type"
  | "unsupported_target_link_uri";

export interface DeepLinkingRejection extends LtiBoundaryDenial {
  code: DeepLinkingRejectionCode;
}

export class DeepLinkingRequestRejectionError extends LtiBoundaryDenialError {
  readonly rejection: DeepLinkingRejection;

  constructor(rejection: DeepLinkingRejection) {
    super(rejection);
    this.name = "DeepLinkingRequestRejectionError";
    this.rejection = rejection;
  }

  override get code(): DeepLinkingRejectionCode {
    return this.rejection.code;
  }
}

export function isDeepLinkingRequestRejectionError(
  error: unknown,
): error is DeepLinkingRequestRejectionError {
  return error instanceof DeepLinkingRequestRejectionError;
}

export async function validateDeepLinkingRequest(input: {
  repository: PackageReviewRepository;
  state: string;
  idToken: string;
  now?: () => Date;
  loadJwks?: (url: string) => Promise<JSONWebKeySet>;
}): Promise<ValidatedDeepLinkingRequest> {
  const now = input.now ?? (() => new Date());
  const loadDeepLinkingJwks = input.loadJwks ?? loadJwks;
  const state = requireDeepLinkingTrimmedValue({
    value: input.state,
    field: "state",
    message: "Deep Linking state is required.",
  });
  const idToken = requireDeepLinkingTrimmedValue({
    value: input.idToken,
    field: "id_token",
    message: "Deep Linking id_token is required.",
  });
  const loginState = await input.repository.getLoginStateByState(state);

  if (!loginState) {
    rejectDeepLinkingSpecInvalid({
      code: "login_state_missing",
      message: `Login state ${state} was not found.`,
      detail: { state },
    });
  }

  if (loginState.usedAt !== null) {
    rejectDeepLinkingSpecInvalid({
      code: "login_state_used",
      message: `Login state ${state} has already been used.`,
      detail: { state },
    });
  }

  if (Date.parse(loginState.expiresAt) <= now().getTime()) {
    rejectDeepLinkingSpecInvalid({
      code: "login_state_expired",
      message: `Login state ${state} has expired.`,
      detail: { state },
    });
  }

  const deployment = await input.repository.getDeploymentByBinding({
    lms: loginState.lms,
    issuer: loginState.issuer,
    clientId: loginState.clientId,
    deploymentId: loginState.deploymentId,
  });

  if (!deployment?.binding) {
    rejectDeepLinkingSpecInvalid({
      code: "deployment_binding_missing",
      message: `${
        formatLmsLabel(loginState.lms)
      } deployment ${loginState.clientId} / ${loginState.deploymentId} was not found for issuer ${loginState.issuer}.`,
      detail: {
        issuer: loginState.issuer,
        clientId: loginState.clientId,
        deploymentId: loginState.deploymentId,
      },
    });
  }
  const ltiProfile = await resolveLtiProfileForDeployment({
    repository: input.repository,
    deployment,
  });
  const behavior = getLtiProfileDefinition(ltiProfile.id).behavior;

  let payload: Awaited<ReturnType<typeof verifyIdTokenWithJwksRetry>>;

  try {
    payload = await verifyIdTokenWithJwksRetry({
      idToken,
      jwksUrl: resolveBindingJwksUrl(deployment.binding),
      issuer: loginState.issuer,
      audience: loginState.clientId,
      now,
      loadJwks: loadDeepLinkingJwks,
      allowRetry: behavior.retryJwksRefetchOnce,
      onRetry: async () => {
        await recordInteropPathUsed({
          repository: input.repository,
          scope: "deep_linking",
          path: "jwks_refetch",
          actorType: "platform",
          deploymentRecordId: deployment.id,
          packageVersionId: deployment.enabledPackageVersionId,
          summary:
            "Lantern refetched platform JWKS during Deep Linking validation.",
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
    rejectDeepLinkingSpecInvalid({
      code: "signature_validation_failed",
      message: "Deep Linking id_token signature or issuer validation failed.",
      detail: {},
    });
  }

  validateDeepLinkingAudience({
    aud: payload.aud,
    azp: payload.azp,
    clientId: loginState.clientId,
    subject: "Deep Linking",
  });

  const deploymentId = requireDeepLinkingStringClaim({
    value: payload[CLAIM_DEPLOYMENT_ID],
    claim: "deployment_id",
    message: "Deep Linking deployment_id is required.",
  });
  const targetLinkUri = requireDeepLinkingStringClaim({
    value: payload[CLAIM_TARGET_LINK_URI],
    claim: "target_link_uri",
    message: "Deep Linking target_link_uri is required.",
  });
  const placement = requireDeepLinkingRouteTarget(targetLinkUri);
  const nonce = resolveDeepLinkingNonce({
    payload,
    allowJtiBridge: behavior.allowDeepLinkingJtiNonceBridge,
  });
  const messageType = requireDeepLinkingStringClaim({
    value: payload[CLAIM_MESSAGE_TYPE],
    claim: "message_type",
    message: "Deep Linking message_type is required.",
  });
  const version = requireDeepLinkingStringClaim({
    value: payload[CLAIM_VERSION],
    claim: "version",
    message: "Deep Linking LTI version is required.",
  });

  if (deploymentId !== loginState.deploymentId) {
    rejectDeepLinkingRequestMismatch({
      field: "deployment_id",
      target: "saved login state",
      message:
        "Deep Linking deployment_id did not match the saved login state.",
    });
  }

  if (
    !targetLinkUrisMatch({
      expected: loginState.targetLinkUri,
      actual: targetLinkUri,
      allowLanternDrift: behavior.tolerateTargetLinkUriDrift,
    })
  ) {
    if (
      targetLinkUriUsesLanternDriftTolerance({
        expected: loginState.targetLinkUri,
        actual: targetLinkUri,
      })
    ) {
      rejectDeepLinkingPolicyDenied({
        code: "target_link_uri_drift_not_allowed",
        message:
          "Deep Linking target_link_uri drift is not allowed for the active LTI profile.",
        detail: {
          expectedTargetLinkUri: loginState.targetLinkUri,
          actualTargetLinkUri: targetLinkUri,
        },
      });
    }

    rejectDeepLinkingRequestMismatch({
      field: "target_link_uri",
      target: "saved login state",
      message:
        "Deep Linking target_link_uri did not match the saved login state.",
    });
  }
  if (
    behavior.tolerateTargetLinkUriDrift &&
    targetLinkUriUsesLanternDriftTolerance({
      expected: loginState.targetLinkUri,
      actual: targetLinkUri,
    })
  ) {
    await recordInteropPathUsed({
      repository: input.repository,
      scope: "deep_linking",
      path: "target_link_uri_drift",
      actorType: "platform",
      deploymentRecordId: deployment.id,
      packageVersionId: deployment.enabledPackageVersionId,
      summary:
        "Lantern tolerated bounded target_link_uri drift during Deep Linking validation.",
      detail: {
        deploymentSlug: deployment.slug,
        issuer: loginState.issuer,
        clientId: loginState.clientId,
        deploymentId: loginState.deploymentId,
        expectedTargetLinkUri: loginState.targetLinkUri,
        actualTargetLinkUri: targetLinkUri,
      },
      ltiProfile,
    });
  }
  if (nonce.value !== loginState.nonce) {
    rejectDeepLinkingRequestMismatch({
      field: "nonce",
      target: "saved login state",
      message: "Deep Linking nonce did not match the saved login state.",
    });
  }

  if (messageType !== LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE) {
    rejectDeepLinkingSpecInvalid({
      code: "unsupported_message_type",
      message: `Unsupported LTI message type ${messageType}.`,
      detail: {
        messageType,
        supportedMessageType: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
      },
    });
  }

  if (version !== "1.3.0") {
    rejectDeepLinkingSpecInvalid({
      code: "unsupported_lti_version",
      message: `Unsupported LTI version ${version}.`,
      detail: {
        version,
        supportedVersion: "1.3.0",
      },
    });
  }

  if (deploymentId !== deployment.binding.deploymentId) {
    rejectDeepLinkingRequestMismatch({
      field: "deployment_id",
      target: "saved deployment binding",
      message:
        "Deep Linking deployment_id did not match the saved deployment binding.",
    });
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
      ltiProfile,
    });
  }

  const settings = parseDeepLinkingSettingsClaim(
    payload[CLAIM_DEEP_LINKING_SETTINGS],
  );
  const context = optionalDeepLinkingRecordClaim({
    value: payload[CLAIM_CONTEXT],
    claim: "context",
    message: "Deep Linking context claim must be an object when provided.",
  });
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

function resolveDeepLinkingNonce(input: {
  payload: Record<string, unknown>;
  allowJtiBridge: boolean;
}): {
  value: string;
  source: "nonce" | "jti";
} {
  const nonce = optionalStringClaim(input.payload.nonce);

  if (nonce !== null) {
    return {
      value: nonce,
      source: "nonce",
    };
  }

  const jti = optionalStringClaim(input.payload.jti);

  if (jti !== null) {
    if (!input.allowJtiBridge) {
      rejectDeepLinkingPolicyDenied({
        code: "nonce_bridge_not_allowed",
        message:
          "Deep Linking nonce must use the nonce claim for the active LTI profile.",
        detail: {
          expectedNonceSource: "nonce",
          actualNonceSource: "jti",
        },
      });
    }

    return {
      value: jti,
      source: "jti",
    };
  }

  rejectDeepLinkingSpecInvalid({
    code: "missing_required_value",
    message: "Deep Linking nonce is required.",
    detail: { claim: "nonce" },
  });
}

function requireDeepLinkingRouteTarget(targetLinkUri: string): LtiPlacement {
  try {
    assertLanternTargetLinkKind({
      targetLinkUri,
      kind: "deep_linking",
      message: `Unsupported Deep Linking target_link_uri ${targetLinkUri}.`,
    });
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "unsupported_target_link_uri",
      message: `Unsupported Deep Linking target_link_uri ${targetLinkUri}.`,
      detail: { targetLinkUri },
    });
  }

  const placement = resolveLanternDeepLinkingPlacement(targetLinkUri);

  if (placement === null) {
    rejectDeepLinkingSpecInvalid({
      code: "unsupported_target_link_uri",
      message:
        `Unsupported Deep Linking placement in target_link_uri ${targetLinkUri}.`,
      detail: { targetLinkUri },
    });
  }

  return placement;
}

function parseDeepLinkingSettingsClaim(value: unknown): DeepLinkingSettings & {
  deepLinkReturnUrl: string;
  data: string | null;
} {
  const settings = requireDeepLinkingRecordClaim({
    value,
    claim: "deep_linking_settings",
    message: "Deep Linking settings claim is required.",
  });
  const acceptTypes = parseAcceptTypes(settings.accept_types);

  return {
    acceptTypes,
    acceptMultiple: requireDeepLinkingOptionalBooleanClaim({
      value: settings.accept_multiple,
      claim: "accept_multiple",
      message: "Deep Linking accept_multiple must be a boolean when provided.",
      fallback: false,
    }),
    acceptPresentationDocumentTargets: parsePresentationDocumentTargets(
      settings.accept_presentation_document_targets,
    ),
    acceptLineItem: requireDeepLinkingOptionalBooleanClaim({
      value: settings.accept_lineitem,
      claim: "accept_lineitem",
      message: "Deep Linking accept_lineitem must be a boolean when provided.",
      fallback: false,
    }),
    deepLinkReturnUrl: requireDeepLinkingStringClaim({
      value: settings.deep_link_return_url,
      claim: "deep_link_return_url",
      message: "Deep Linking return URL is required.",
    }),
    data: optionalDeepLinkingTypedStringClaim({
      value: settings.data,
      claim: "data",
      message: "Deep Linking data must be a string when provided.",
    }),
  };
}

function parseAcceptTypes(value: unknown): DeepLinkingAcceptType[] {
  const items = readStringArray(value);

  if (items.length === 0) {
    rejectDeepLinkingSpecInvalid({
      code: "missing_required_value",
      message: "Deep Linking accept_types must include ltiResourceLink.",
      detail: { claim: "accept_types" },
    });
  }

  const unsupported = items.filter((item) => item !== "ltiResourceLink");

  if (unsupported.length > 0) {
    rejectDeepLinkingSpecInvalid({
      code: "unsupported_deep_linking_accept_type",
      message: `Unsupported Deep Linking accept_types: ${
        unsupported.join(", ")
      }.`,
      detail: { acceptTypes: unsupported.join(", ") },
    });
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
      rejectDeepLinkingSpecInvalid({
        code: "unsupported_deep_linking_presentation_target",
        message: `Unsupported Deep Linking presentation target ${item}.`,
        detail: { presentationTarget: item },
      });
    }
  }

  return Array.from(new Set(items)) as DeepLinkingPresentationDocumentTarget[];
}

function requireDeepLinkingTrimmedValue(input: {
  value: string;
  field: string;
  message: string;
}): string {
  try {
    return requireTrimmedValue(input.value, input.message);
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "missing_required_value",
      message: input.message,
      detail: { field: input.field },
    });
  }
}

function requireDeepLinkingStringClaim(input: {
  value: unknown;
  claim: string;
  message: string;
}): string {
  try {
    return requireStringClaim(input.value, input.message);
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "missing_required_value",
      message: input.message,
      detail: { claim: input.claim },
    });
  }
}

function requireDeepLinkingRecordClaim(input: {
  value: unknown;
  claim: string;
  message: string;
}): Record<string, unknown> {
  try {
    return requireRecordClaim(input.value, input.message);
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "missing_required_value",
      message: input.message,
      detail: { claim: input.claim },
    });
  }
}

function optionalDeepLinkingRecordClaim(input: {
  value: unknown;
  claim: string;
  message: string;
}): Record<string, unknown> | null {
  try {
    return optionalRecordClaim(input.value, input.message);
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "invalid_value",
      message: input.message,
      detail: { claim: input.claim },
    });
  }
}

function requireDeepLinkingOptionalBooleanClaim(input: {
  value: unknown;
  claim: string;
  message: string;
  fallback: boolean;
}): boolean {
  try {
    return requireOptionalBooleanClaim(
      input.value,
      input.message,
      input.fallback,
    );
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "invalid_value",
      message: input.message,
      detail: { claim: input.claim },
    });
  }
}

function optionalDeepLinkingTypedStringClaim(input: {
  value: unknown;
  claim: string;
  message: string;
}): string | null {
  try {
    return optionalTypedStringClaim(input.value, input.message);
  } catch {
    rejectDeepLinkingSpecInvalid({
      code: "invalid_value",
      message: input.message,
      detail: { claim: input.claim },
    });
  }
}

function validateDeepLinkingAudience(input: {
  aud: string | string[] | undefined;
  azp: unknown;
  clientId: string;
  subject: string;
}): void {
  try {
    validateLtiAudience(input);
  } catch (error) {
    rejectDeepLinkingSpecInvalid({
      code: "audience_mismatch",
      message: error instanceof Error
        ? error.message
        : `${input.subject} audience validation failed.`,
      detail: { clientId: input.clientId },
    });
  }
}

function rejectDeepLinkingRequestMismatch(input: {
  field: string;
  target: string;
  message: string;
}): never {
  rejectDeepLinkingSpecInvalid({
    code: "request_mismatch",
    message: input.message,
    detail: {
      field: input.field,
      target: input.target,
    },
  });
}

function rejectDeepLinkingSpecInvalid(input: {
  code: DeepLinkingRejectionCode;
  message: string;
  detail: Record<string, string | number | null | undefined>;
}): never {
  rejectDeepLinking({
    category: "specInvalid",
    code: input.code,
    message: input.message,
    detail: buildRejectionDetailRecord(input.detail),
  });
}

function rejectDeepLinkingPolicyDenied(input: {
  code: DeepLinkingRejectionCode;
  message: string;
  detail: Record<string, string | number | null | undefined>;
}): never {
  rejectDeepLinking({
    category: "policyDenied",
    code: input.code,
    message: input.message,
    detail: buildRejectionDetailRecord(input.detail),
  });
}

function rejectDeepLinking(rejection: DeepLinkingRejection): never {
  throw new DeepLinkingRequestRejectionError(rejection);
}
