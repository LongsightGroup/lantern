import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentInventoryRow,
  OfficialBrokerCertificationStatus,
} from "../ops/types.ts";
import { resolveSupportedPathForDeployment } from "../ops/broker_verification_paths.ts";
import type { InMemoryRepositoryState } from "./package_review_in_memory_shared.ts";
import { buildBrokerVerificationStatus } from "./package_review_test_builder_ops.ts";

export function latestOfficialForScope(
  state: InMemoryRepositoryState,
  scope: BrokerVerificationStatus["supportedPath"],
): OfficialBrokerCertificationStatus {
  const latestMatch = [...state.brokerVerifications]
    .filter((candidate) => candidate.supportedPath === scope)
    .sort((left, right) => {
      const leftCheckedAt = left.official.checkedAt ?? "";
      const rightCheckedAt = right.official.checkedAt ?? "";

      return rightCheckedAt.localeCompare(leftCheckedAt);
    })[0];

  return (
    latestMatch?.official ?? {
      state: "notCertified",
      checkedAt: null,
      directoryUrl: null,
    }
  );
}

export function applyOfficialVerificationToDeployment(
  deployment: ControlPlaneDeploymentInventoryRow,
  scope: BrokerVerificationStatus["supportedPath"],
  official: OfficialBrokerCertificationStatus,
): ControlPlaneDeploymentInventoryRow {
  if (resolveSupportedPathForDeployment(deployment) !== scope) {
    return deployment;
  }

  return {
    ...deployment,
    brokerVerification: buildBrokerVerificationStatus({
      supportedPath: scope,
      internal: deployment.brokerVerification?.internal ?? null,
      official,
    }),
  };
}

export function applyOfficialVerificationToDetail(
  detail: ControlPlaneDeploymentDetailSnapshot,
  scope: BrokerVerificationStatus["supportedPath"],
  official: OfficialBrokerCertificationStatus,
): ControlPlaneDeploymentDetailSnapshot {
  if (resolveSupportedPathForDeployment(detail.inventory) !== scope) {
    return detail;
  }

  const brokerVerification = buildBrokerVerificationStatus({
    supportedPath: scope,
    internal: detail.brokerVerification?.internal ??
      detail.inventory.brokerVerification?.internal ?? null,
    official,
  });

  return {
    ...detail,
    inventory: {
      ...detail.inventory,
      brokerVerification,
    },
    brokerVerification,
  };
}
