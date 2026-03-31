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

export function rejectLaunch(rejection: LaunchRejection): never {
  throw new LaunchRejectionError(rejection);
}

export function buildLaunchDetailRecord(
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
