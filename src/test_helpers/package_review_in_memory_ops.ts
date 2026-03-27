import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDeploymentInventoryRow,
  OfficialBrokerCertificationStatus,
} from "../ops/types.ts";
import { assertBrokerVerificationRunInput } from "../ops/repository_mapping.ts";
import type {
  InMemoryOpsRepository,
  InMemoryRepositoryState,
} from "./package_review_in_memory_shared.ts";
import {
  cloneRecord,
  getLatestBrokerVerificationRecord,
} from "./package_review_in_memory_shared.ts";
import {
  buildBrokerVerificationStatus,
  buildDeploymentGradePublicationSnapshot,
  buildRetryableGradePublicationLookup,
  buildRetryRuntimeSessionLookup,
} from "./package_review_test_builder_ops.ts";

type OpsRepository = Pick<
  InMemoryOpsRepository,
  | "listControlPlaneDeployments"
  | "getControlPlaneDeploymentDetail"
  | "listControlPlaneDiagnostics"
  | "getLatestBrokerVerification"
  | "getLatestBrokerVerificationStatus"
  | "recordBrokerVerificationRun"
  | "getRetryableGradePublicationLookup"
>;

export function createInMemoryOpsRepositorySection(
  state: InMemoryRepositoryState,
): OpsRepository {
  return {
    listControlPlaneDeployments() {
      return Promise.resolve(
        state.controlPlaneDeployments.map(cloneRecord).sort((left, right) => {
          const updatedAt = right.updatedAt.localeCompare(left.updatedAt);

          if (updatedAt !== 0) {
            return updatedAt;
          }

          return right.deploymentId - left.deploymentId;
        }),
      );
    },

    getControlPlaneDeploymentDetail(deploymentRecordId) {
      const record = state.controlPlaneDeploymentDetails.find(
        (candidate) => candidate.inventory.deploymentId === deploymentRecordId,
      );

      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    listControlPlaneDiagnostics(deploymentRecordId) {
      return Promise.resolve(
        state.controlPlaneDiagnostics
          .filter((candidate) =>
            candidate.deploymentRecordId === deploymentRecordId
          )
          .map(cloneRecord)
          .sort((left, right) => {
            const occurredAt = right.occurredAt.localeCompare(left.occurredAt);

            if (occurredAt !== 0) {
              return occurredAt;
            }

            return right.id - left.id;
          }),
      );
    },

    getLatestBrokerVerification() {
      const record = getLatestBrokerVerificationRecord(
        state.brokerVerifications,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getLatestBrokerVerificationStatus() {
      const record = getLatestBrokerVerificationRecord(
        state.brokerVerifications,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    recordBrokerVerificationRun(input) {
      assertBrokerVerificationRunInput(input);
      const official: OfficialBrokerCertificationStatus =
        input.source === "1edtech"
          ? {
            state: input.certificationState ?? "notCertified",
            checkedAt: input.checkedAt,
            directoryUrl: input.detailUrl,
          }
          : latestOfficialForScope(state, input.scope);
      const nextRecord = input.source === "1edtech"
        ? buildBrokerVerificationStatus({
          supportedPath: input.scope,
          internal: null,
          official,
        })
        : buildBrokerVerificationStatus({
          supportedPath: input.scope,
          internal: {
            source: input.source,
            status: input.status as "failed" | "passed" | "pending",
            checkedAt: input.checkedAt,
            summary: input.summary,
            evidenceUrl: input.detailUrl,
          },
          official,
        });

      state.brokerVerifications.push(cloneRecord(nextRecord));

      if (input.source === "1edtech") {
        state.controlPlaneDeployments = state.controlPlaneDeployments.map((
          deployment,
        ) =>
          applyOfficialVerificationToDeployment(
            deployment,
            input.scope,
            official,
          )
        );
        state.controlPlaneDeploymentDetails = state
          .controlPlaneDeploymentDetails.map((detail) =>
            applyOfficialVerificationToDetail(detail, input.scope, official)
          );
      } else if (input.deploymentRecordId !== null) {
        state.controlPlaneDeployments = state.controlPlaneDeployments.map((
          deployment,
        ) =>
          deployment.deploymentId === input.deploymentRecordId
            ? {
              ...deployment,
              brokerVerification: cloneRecord(nextRecord),
            }
            : deployment
        );
        state.controlPlaneDeploymentDetails = state
          .controlPlaneDeploymentDetails.map((detail) =>
            detail.inventory.deploymentId === input.deploymentRecordId
              ? {
                ...detail,
                inventory: {
                  ...detail.inventory,
                  brokerVerification: cloneRecord(nextRecord),
                },
                brokerVerification: cloneRecord(nextRecord),
              }
              : detail
          );
      }

      return Promise.resolve();
    },

    getRetryableGradePublicationLookup(attemptId) {
      const seededRecord = state.retryableGradePublications.find(
        (candidate) => candidate.attemptId === attemptId,
      );

      if (seededRecord) {
        return Promise.resolve(cloneRecord(seededRecord));
      }

      const publication = state.gradePublications.find(
        (candidate) =>
          candidate.attemptId === attemptId && candidate.status === "failed",
      );
      const attempt = state.attempts.find((candidate) =>
        candidate.attemptId === attemptId
      );

      if (!publication || !attempt) {
        return Promise.resolve(null);
      }

      const deployment = state.deployments.find(
        (candidate) => candidate.id === attempt.deploymentRecordId,
      );
      const runtimeSession = [...state.runtimeSessions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .find((candidate) => candidate.attemptId === attemptId);

      return Promise.resolve(
        buildRetryableGradePublicationLookup({
          attemptId,
          deploymentRecordId: attempt.deploymentRecordId,
          deploymentSlug: attempt.deploymentSlug,
          publication: buildDeploymentGradePublicationSnapshot({
            attemptId: publication.attemptId,
            status: publication.status,
            lineItemUrl: publication.lineItemUrl,
            canvasUserId: publication.canvasUserId,
            scoreGiven: publication.scoreGiven,
            scoreMaximum: publication.scoreMaximum,
            activityProgress: publication.activityProgress,
            gradingProgress: publication.gradingProgress,
            publishedAt: publication.publishedAt,
            updatedAt: publication.updatedAt,
            errorCode: publication.errorCode,
            errorDetail: publication.errorDetail,
          }),
          binding: deployment?.binding ?? null,
          runtimeSession: runtimeSession
            ? buildRetryRuntimeSessionLookup({
              sessionId: runtimeSession.sessionId,
              attemptId: runtimeSession.attemptId,
              deploymentRecordId: runtimeSession.deploymentRecordId,
              deploymentSlug: runtimeSession.deploymentSlug,
              appId: runtimeSession.appId,
              packageVersionId: runtimeSession.packageVersionId,
              packageVersion: runtimeSession.packageVersion,
              services: runtimeSession.services,
              createdAt: runtimeSession.createdAt,
              expiresAt: runtimeSession.expiresAt,
            })
            : null,
        }),
      );
    },
  };
}

function latestOfficialForScope(
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

  return latestMatch?.official ?? {
    state: "notCertified",
    checkedAt: null,
    directoryUrl: null,
  };
}

function applyOfficialVerificationToDeployment(
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

function applyOfficialVerificationToDetail(
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

function resolveSupportedPathForDeployment(
  deployment: ControlPlaneDeploymentInventoryRow,
): BrokerVerificationStatus["supportedPath"] | null {
  if (deployment.brokerVerification !== null) {
    return deployment.brokerVerification.supportedPath;
  }

  switch (deployment.binding?.lms ?? null) {
    case "canvas":
      return "canvasLti13LaunchAgsNrps";
    case "moodle":
      return "moodleLti13LaunchAgsScore";
    case "sakai":
      return "sakaiLti13LaunchAgsScore";
    case null:
      return null;
  }
}
