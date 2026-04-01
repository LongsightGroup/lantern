export type LtiBoundaryDenialCategory = "specInvalid" | "policyDenied";

export interface LtiBoundaryDenial {
  category: LtiBoundaryDenialCategory;
  code: string;
  message: string;
  detail: Record<string, string | null>;
}

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

export interface LaunchRejection extends LtiBoundaryDenial {
  code: LaunchRejectionCode;
}

type LaunchRejectionInput = Omit<LaunchRejection, "category"> & {
  category?: LtiBoundaryDenialCategory;
};

const POLICY_DENIED_LAUNCH_CODES = new Set<LaunchRejectionCode>([
  "launch_package_version_missing",
  "missing_pinned_package_version",
  "package_not_approved",
  "reviewed_placement_context_mismatch",
  "reviewed_placement_deployment_mismatch",
  "reviewed_placement_not_found",
  "reviewed_placement_resource_link_conflict",
]);

export class LtiBoundaryDenialError extends Error {
  readonly denial: LtiBoundaryDenial;

  constructor(denial: LtiBoundaryDenial) {
    super(denial.message);
    this.name = "LtiBoundaryDenialError";
    this.denial = denial;
  }

  get category(): LtiBoundaryDenialCategory {
    return this.denial.category;
  }

  get code(): string {
    return this.denial.code;
  }

  get detail(): Record<string, string | null> {
    return this.denial.detail;
  }
}

export class LaunchRejectionError extends LtiBoundaryDenialError {
  readonly rejection: LaunchRejection;

  constructor(rejection: LaunchRejection) {
    super(rejection);
    this.name = "LaunchRejectionError";
    this.rejection = rejection;
  }

  override get code(): LaunchRejectionCode {
    return this.rejection.code;
  }

  override get category(): LtiBoundaryDenialCategory {
    return this.rejection.category;
  }

  override get detail(): Record<string, string | null> {
    return this.rejection.detail;
  }
}

export function isLtiBoundaryDenialError(
  error: unknown,
): error is LtiBoundaryDenialError {
  return error instanceof LtiBoundaryDenialError;
}

export function isLaunchRejectionError(
  error: unknown,
): error is LaunchRejectionError {
  return error instanceof LaunchRejectionError;
}

export function rejectLaunch(rejection: LaunchRejectionInput): never {
  throw new LaunchRejectionError({
    ...rejection,
    category: rejection.category ?? categorizeLaunchRejection(rejection.code),
  });
}

export function buildRejectionDetailRecord(
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

export const buildLaunchDetailRecord = buildRejectionDetailRecord;

function categorizeLaunchRejection(
  code: LaunchRejectionCode,
): LtiBoundaryDenialCategory {
  return POLICY_DENIED_LAUNCH_CODES.has(code) ? "policyDenied" : "specInvalid";
}
