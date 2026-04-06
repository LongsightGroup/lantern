import {
  LtiBoundaryDenialError,
  type LtiBoundaryDenial,
  type LtiBoundaryDenialCategory,
} from './lti_boundary_denial.ts';

export {
  buildLaunchDetailRecord,
  buildRejectionDetailRecord,
  isLtiBoundaryDenialError,
  LtiBoundaryDenialError,
  type LtiBoundaryDenial,
  type LtiBoundaryDenialCategory,
} from './lti_boundary_denial.ts';

export type LaunchRejectionCode =
  | 'deployment_binding_missing'
  | 'deployment_mismatch'
  | 'launch_package_version_missing'
  | 'login_state_expired'
  | 'login_state_missing'
  | 'login_state_used'
  | 'missing_baseline_claim'
  | 'missing_pinned_package_version'
  | 'package_not_approved'
  | 'reviewed_placement_context_mismatch'
  | 'reviewed_placement_deployment_mismatch'
  | 'reviewed_placement_not_found'
  | 'reviewed_placement_resource_link_conflict'
  | 'signature_validation_failed'
  | 'unsupported_lti_version'
  | 'unsupported_message_type';

export interface LaunchRejection extends LtiBoundaryDenial {
  code: LaunchRejectionCode;
}

type LaunchRejectionInput = Omit<LaunchRejection, 'category'> & {
  category?: LtiBoundaryDenialCategory;
};

const POLICY_DENIED_LAUNCH_CODES = new Set<LaunchRejectionCode>([
  'launch_package_version_missing',
  'missing_pinned_package_version',
  'package_not_approved',
  'reviewed_placement_context_mismatch',
  'reviewed_placement_deployment_mismatch',
  'reviewed_placement_not_found',
  'reviewed_placement_resource_link_conflict',
]);

export class LaunchRejectionError extends LtiBoundaryDenialError {
  readonly rejection: LaunchRejection;

  constructor(rejection: LaunchRejection) {
    super(rejection);
    this.name = 'LaunchRejectionError';
    this.rejection = rejection;
  }

  override get code(): LaunchRejectionCode {
    return this.rejection.code;
  }
}

export function isLaunchRejectionError(error: unknown): error is LaunchRejectionError {
  return error instanceof LaunchRejectionError;
}

export function rejectLaunch(rejection: LaunchRejectionInput): never {
  throw new LaunchRejectionError({
    ...rejection,
    category: rejection.category ?? categorizeLaunchRejection(rejection.code),
  });
}

function categorizeLaunchRejection(code: LaunchRejectionCode): LtiBoundaryDenialCategory {
  return POLICY_DENIED_LAUNCH_CODES.has(code) ? 'policyDenied' : 'specInvalid';
}
