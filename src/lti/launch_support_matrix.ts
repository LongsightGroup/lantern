import { LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE } from "./types.ts";

export const GOVERNED_RUNTIME_BASELINE_RULE = "governed_runtime_baseline";
export const SUPPORTED_LTI_LAUNCH_PATH = "/lti/launch";
export const SUPPORTED_LTI_VERSION = "1.3.0";

export type LaunchRejectionCode =
  | "deployment_binding_missing"
  | "deployment_mismatch"
  | "launch_package_version_missing"
  | "login_state_expired"
  | "login_state_missing"
  | "login_state_used"
  | "missing_baseline_claim"
  | "missing_pinned_package_version"
  | "package_not_approved"
  | "reviewed_placement_context_mismatch"
  | "reviewed_placement_deployment_mismatch"
  | "reviewed_placement_not_found"
  | "reviewed_placement_resource_link_conflict"
  | "signature_validation_failed"
  | "unsupported_lti_version"
  | "unsupported_message_type";

export interface LaunchRejection {
  code: LaunchRejectionCode;
  message: string;
  detail: Record<string, string | null>;
}

export class LaunchRejectionError extends Error {
  readonly rejection: LaunchRejection;

  constructor(rejection: LaunchRejection) {
    super(rejection.message);
    this.name = "LaunchRejectionError";
    this.rejection = rejection;
  }

  get code(): LaunchRejectionCode {
    return this.rejection.code;
  }

  get detail(): Record<string, string | null> {
    return this.rejection.detail;
  }
}

export function isLaunchRejectionError(
  error: unknown,
): error is LaunchRejectionError {
  return error instanceof LaunchRejectionError;
}

export function assertSupportedLaunchMessageType(messageType: string): void {
  if (messageType === LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE) {
    return;
  }

  rejectLaunch({
    code: "unsupported_message_type",
    message:
      `Launch rejected because ${SUPPORTED_LTI_LAUNCH_PATH} only accepts ${LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE} for the governed runtime baseline.`,
    detail: buildDetailRecord({
      route: SUPPORTED_LTI_LAUNCH_PATH,
      rule: GOVERNED_RUNTIME_BASELINE_RULE,
      messageType,
      supportedMessageType: LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE,
      version: SUPPORTED_LTI_VERSION,
    }),
  });
}

export function assertSupportedLaunchVersion(version: string): void {
  if (version === SUPPORTED_LTI_VERSION) {
    return;
  }

  rejectLaunch({
    code: "unsupported_lti_version",
    message:
      `Launch rejected because ${SUPPORTED_LTI_LAUNCH_PATH} only supports LTI ${SUPPORTED_LTI_VERSION} for the governed runtime baseline.`,
    detail: buildDetailRecord({
      route: SUPPORTED_LTI_LAUNCH_PATH,
      rule: GOVERNED_RUNTIME_BASELINE_RULE,
      version,
      supportedVersion: SUPPORTED_LTI_VERSION,
    }),
  });
}

export function requireBaselineStringClaim(
  value: unknown,
  claim: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    rejectLaunch({
      code: "missing_baseline_claim",
      message:
        `Launch rejected because the governed runtime baseline requires ${claim}.`,
      detail: buildDetailRecord({
        route: SUPPORTED_LTI_LAUNCH_PATH,
        rule: GOVERNED_RUNTIME_BASELINE_RULE,
        claim,
      }),
    });
  }

  return value.trim();
}

export function rejectLoginStateMissing(state: string): never {
  rejectLaunch({
    code: "login_state_missing",
    message: `Login state ${state} was not found.`,
    detail: buildDetailRecord({
      state,
    }),
  });
}

export function rejectLoginStateUsed(state: string): never {
  rejectLaunch({
    code: "login_state_used",
    message: `Login state ${state} has already been used.`,
    detail: buildDetailRecord({
      state,
    }),
  });
}

export function rejectLoginStateExpired(state: string): never {
  rejectLaunch({
    code: "login_state_expired",
    message: `Login state ${state} has expired.`,
    detail: buildDetailRecord({
      state,
    }),
  });
}

export function rejectDeploymentBindingMissing(input: {
  lmsLabel: string;
  clientId: string;
  deploymentId: string;
  issuer: string;
}): never {
  rejectLaunch({
    code: "deployment_binding_missing",
    message:
      `${input.lmsLabel} deployment ${input.clientId} / ${input.deploymentId} was not found for issuer ${input.issuer}.`,
    detail: buildDetailRecord({
      issuer: input.issuer,
      clientId: input.clientId,
      deploymentId: input.deploymentId,
    }),
  });
}

export function rejectSignatureValidationFailed(): never {
  rejectLaunch({
    code: "signature_validation_failed",
    message: "Launch id_token signature or issuer validation failed.",
    detail: buildDetailRecord({}),
  });
}

export function rejectDeploymentMismatch(input: {
  field: string;
  target: string;
}): never {
  rejectLaunch({
    code: "deployment_mismatch",
    message: `Launch ${input.field} did not match the ${input.target}.`,
    detail: buildDetailRecord({
      field: input.field,
      target: input.target,
    }),
  });
}

export function rejectReviewedPlacementNotFound(placementId: string): never {
  rejectLaunch({
    code: "reviewed_placement_not_found",
    message: `Reviewed placement ${placementId} was not found.`,
    detail: buildDetailRecord({
      placementId,
    }),
  });
}

export function rejectReviewedPlacementDeploymentMismatch(input: {
  placementId: string;
  deploymentSlug: string;
  placementDeploymentSlug?: string | null;
}): never {
  rejectLaunch({
    code: "reviewed_placement_deployment_mismatch",
    message:
      `Reviewed placement ${input.placementId} does not belong to deployment ${input.deploymentSlug}.`,
    detail: buildDetailRecord({
      placementId: input.placementId,
      deploymentSlug: input.deploymentSlug,
      placementDeploymentSlug: input.placementDeploymentSlug,
    }),
  });
}

export function rejectReviewedPlacementContextMismatch(input: {
  placementId: string;
  contextId: string;
  placementContextId?: string | null;
}): never {
  rejectLaunch({
    code: "reviewed_placement_context_mismatch",
    message:
      `Reviewed placement ${input.placementId} does not match governed launch context ${input.contextId}.`,
    detail: buildDetailRecord({
      placementId: input.placementId,
      contextId: input.contextId,
      placementContextId: input.placementContextId,
    }),
  });
}

export function rejectReviewedPlacementResourceLinkConflict(input: {
  placementId: string;
  resourceLinkId: string;
  existingResourceLinkId?: string | null;
  deploymentSlug?: string | null;
}): never {
  if (input.existingResourceLinkId) {
    rejectLaunch({
      code: "reviewed_placement_resource_link_conflict",
      message:
        `Reviewed placement ${input.placementId} is already bound to resource link ${input.existingResourceLinkId}.`,
      detail: buildDetailRecord({
        placementId: input.placementId,
        resourceLinkId: input.resourceLinkId,
        existingResourceLinkId: input.existingResourceLinkId,
      }),
    });
  }

  rejectLaunch({
    code: "reviewed_placement_resource_link_conflict",
    message: input.deploymentSlug
      ? `Resource link ${input.resourceLinkId} is already bound to another reviewed placement in deployment ${input.deploymentSlug}.`
      : `Resource link ${input.resourceLinkId} conflicts with the saved reviewed placement binding.`,
    detail: buildDetailRecord({
      placementId: input.placementId,
      resourceLinkId: input.resourceLinkId,
      deploymentSlug: input.deploymentSlug,
    }),
  });
}

export function rejectMissingPinnedPackageVersion(
  deploymentSlug: string,
): never {
  rejectLaunch({
    code: "missing_pinned_package_version",
    message:
      `Launch rejected because deployment ${deploymentSlug} does not have an approved pinned package version.`,
    detail: buildDetailRecord({
      deploymentSlug,
    }),
  });
}

export function rejectLaunchPackageVersionMissing(
  packageVersionId: number,
): never {
  rejectLaunch({
    code: "launch_package_version_missing",
    message: `Launch package version id ${packageVersionId} was not found.`,
    detail: buildDetailRecord({
      packageVersionId,
    }),
  });
}

export function rejectPackageNotApproved(input: {
  appId: string;
  packageVersion: string;
}): never {
  rejectLaunch({
    code: "package_not_approved",
    message:
      `Launch package version ${input.appId}@${input.packageVersion} is not approved.`,
    detail: buildDetailRecord({
      appId: input.appId,
      packageVersion: input.packageVersion,
    }),
  });
}

function rejectLaunch(rejection: LaunchRejection): never {
  throw new LaunchRejectionError(rejection);
}

function buildDetailRecord(
  detail: Record<string, string | number | null | undefined>,
): Record<string, string | null> {
  const normalized: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(detail)) {
    normalized[key] = value === undefined || value === null
      ? null
      : String(value);
  }

  return normalized;
}
