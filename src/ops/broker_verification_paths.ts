import type { DeploymentBinding, LmsType } from '../lti/types.ts';
import type {
  BrokerVerificationStatus,
  BrokerVerificationSupportedPath,
  ControlPlaneDeploymentInventoryRow,
} from './types.ts';

export const BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS: Record<
  LmsType,
  BrokerVerificationSupportedPath
> = {
  canvas: 'lti13LaunchAgsNrps',
  moodle: 'lti13LaunchAgsScore',
  sakai: 'lti13LaunchAgsScore',
};

export const BROKER_VERIFICATION_SUPPORTED_PATHS = [
  'lti13LaunchAgsNrps',
  'lti13LaunchAgsScore',
] as const satisfies readonly BrokerVerificationSupportedPath[];

export function isBrokerVerificationSupportedPath(
  value: string,
): value is BrokerVerificationSupportedPath {
  return BROKER_VERIFICATION_SUPPORTED_PATHS.includes(value as BrokerVerificationSupportedPath);
}

export function describeSupportedPath(
  supportedPath: BrokerVerificationStatus['supportedPath'],
): string {
  switch (supportedPath) {
    case 'lti13LaunchAgsNrps':
      return 'LTI 1.3 launch, AGS, and NRPS';
    case 'lti13LaunchAgsScore':
      return 'LTI 1.3 launch and AGS score publish';
  }
}

export function resolveSupportedPathForBinding(
  binding: DeploymentBinding | null,
): BrokerVerificationStatus['supportedPath'] | null {
  if (binding === null) {
    return null;
  }

  return BROKER_VERIFICATION_SUPPORTED_PATH_BY_LMS[binding.lms];
}

export function resolveSupportedPathForDeployment(
  deployment: Pick<ControlPlaneDeploymentInventoryRow, 'binding' | 'brokerVerification'>,
): BrokerVerificationStatus['supportedPath'] | null {
  return (
    deployment.brokerVerification?.supportedPath ??
      resolveSupportedPathForBinding(deployment.binding)
  );
}
