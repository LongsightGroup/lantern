import type { OfficialBrokerCertificationStatus } from '../ops/types.ts';
import { assertBrokerVerificationRunInput } from '../ops/repository_mapping.ts';
import type {
  InMemoryOpsRepository,
  InMemoryRepositoryState,
} from './package_review_in_memory_shared.ts';
import {
  cloneRecord,
  getLatestBrokerVerificationRecord,
} from './package_review_in_memory_shared.ts';
import {
  applyOfficialVerificationToDeployment,
  applyOfficialVerificationToDetail,
  latestOfficialForScope,
} from './package_review_in_memory_ops_support.ts';
import {
  buildBrokerVerificationStatus,
  buildDeploymentGradePublicationSnapshot,
  buildRetryableGradePublicationLookup,
  buildRetryRuntimeSessionLookup,
} from './package_review_test_builder_ops.ts';

type OpsRepository = Pick<
  InMemoryOpsRepository,
  | 'listControlPlaneDeployments'
  | 'getControlPlaneDeploymentDetail'
  | 'listControlPlaneDiagnostics'
  | 'listCertificationWorkflowStatuses'
  | 'getLatestOfficialCertificationEvidence'
  | 'getLatestBrokerVerification'
  | 'getLatestBrokerVerificationStatus'
  | 'recordBrokerVerificationRun'
  | 'getRetryableGradePublicationLookup'
>;

export function createInMemoryOpsRepositorySection(state: InMemoryRepositoryState): OpsRepository {
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
          .filter((candidate) => candidate.deploymentRecordId === deploymentRecordId)
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

    listCertificationWorkflowStatuses() {
      return Promise.resolve(state.certificationWorkflowStatuses.map(cloneRecord));
    },

    getLatestOfficialCertificationEvidence() {
      return Promise.resolve(
        state.latestOfficialCertificationEvidence
          ? cloneRecord(state.latestOfficialCertificationEvidence)
          : null,
      );
    },

    getLatestBrokerVerification() {
      const record = getLatestBrokerVerificationRecord(state.brokerVerifications);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getLatestBrokerVerificationStatus() {
      const record = getLatestBrokerVerificationRecord(state.brokerVerifications);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    recordBrokerVerificationRun(input) {
      assertBrokerVerificationRunInput(input);
      const official: OfficialBrokerCertificationStatus = input.source === '1edtech'
        ? {
          state: input.certificationState ?? 'notCertified',
          checkedAt: input.checkedAt,
          directoryUrl: input.detailUrl,
        }
        : latestOfficialForScope(state, input.scope);
      const nextRecord = input.source === '1edtech'
        ? buildBrokerVerificationStatus({
          supportedPath: input.scope,
          internal: null,
          official,
        })
        : buildBrokerVerificationStatus({
          supportedPath: input.scope,
          internal: {
            source: input.source,
            status: input.status as 'failed' | 'passed' | 'pending',
            checkedAt: input.checkedAt,
            summary: input.summary,
            evidenceUrl: input.detailUrl,
          },
          official,
        });

      state.brokerVerifications.push(cloneRecord(nextRecord));

      if (input.source === '1edtech') {
        const nextOfficialEvidence = {
          workflowKey: input.workflowKey,
          state: (input.certificationState ??
            'notCertified') as OfficialBrokerCertificationStatus['state'],
          checkedAt: input.checkedAt,
          summary: input.summary,
          directoryUrl: input.detailUrl,
        };

        if (
          shouldReplaceLatestOfficialEvidence(
            state.latestOfficialCertificationEvidence,
            nextOfficialEvidence.checkedAt,
          )
        ) {
          state.latestOfficialCertificationEvidence = cloneRecord(nextOfficialEvidence);
        }
      } else if (input.deploymentRecordId !== null) {
        const deploymentRecordId = input.deploymentRecordId;

        state.certificationWorkflowStatuses = state.certificationWorkflowStatuses
          .map((workflowStatus) =>
            workflowStatus.workflowKey === input.workflowKey &&
              shouldReplaceWorkflowEvidence(
                workflowStatus.latestInternal?.checkedAt ?? null,
                input.checkedAt,
              )
              ? {
                workflowKey: workflowStatus.workflowKey,
                latestInternal: {
                  deploymentRecordId,
                  deploymentLabel: resolveDeploymentLabel(state, deploymentRecordId),
                  status: input.status as 'failed' | 'passed' | 'pending',
                  checkedAt: input.checkedAt,
                  summary: input.summary,
                  evidenceUrl: input.detailUrl,
                },
              }
              : workflowStatus
          )
          .map(cloneRecord);
      }

      if (input.source === '1edtech') {
        state.controlPlaneDeployments = state.controlPlaneDeployments.map((deployment) =>
          applyOfficialVerificationToDeployment(deployment, input.scope, official)
        );
        state.controlPlaneDeploymentDetails = state.controlPlaneDeploymentDetails.map((detail) =>
          applyOfficialVerificationToDetail(detail, input.scope, official)
        );
      } else if (input.deploymentRecordId !== null) {
        state.controlPlaneDeployments = state.controlPlaneDeployments.map((deployment) =>
          deployment.deploymentId === input.deploymentRecordId
            ? {
              ...deployment,
              brokerVerification: cloneRecord(nextRecord),
            }
            : deployment
        );
        state.controlPlaneDeploymentDetails = state.controlPlaneDeploymentDetails.map((detail) =>
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
        (candidate) => candidate.attemptId === attemptId && candidate.status === 'failed',
      );
      const attempt = state.attempts.find((candidate) => candidate.attemptId === attemptId);

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
            platformUserId: publication.platformUserId,
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

function shouldReplaceWorkflowEvidence(
  currentCheckedAt: string | null,
  nextCheckedAt: string,
): boolean {
  return currentCheckedAt === null || nextCheckedAt >= currentCheckedAt;
}

function shouldReplaceLatestOfficialEvidence(
  current: InMemoryRepositoryState['latestOfficialCertificationEvidence'] | null,
  nextCheckedAt: string,
): boolean {
  return current === null || nextCheckedAt >= current.checkedAt;
}

function resolveDeploymentLabel(
  state: InMemoryRepositoryState,
  deploymentRecordId: number,
): string {
  return (
    state.controlPlaneDeployments.find(
      (deployment) => deployment.deploymentId === deploymentRecordId,
    )?.deploymentLabel ?? `Deployment ${deploymentRecordId}`
  );
}
