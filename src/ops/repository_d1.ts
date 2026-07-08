import type { D1Database } from '../db/d1.ts';
import { queryD1Objects } from '../db/d1.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { type D1InventoryQueryRow, mapD1InventoryRow } from './repository_d1_mapping.ts';
import {
  getLatestBrokerVerificationStatusForD1,
  getLatestOfficialCertificationEvidenceForD1,
  listCertificationWorkflowStatusesForD1,
  recordBrokerVerificationRunForD1,
} from './repository_d1_broker.ts';
import {
  getControlPlaneDeploymentDetailForD1,
  getRetryableGradePublicationLookupForD1,
} from './repository_d1_detail.ts';
import { D1_INVENTORY_QUERY } from './repository_d1_queries.ts';
import { mapInventoryRow } from './repository_mapping.ts';
import type { OpsRepository } from './repository_types.ts';

export function createD1OpsRepository(
  db: D1Database,
  packageReviewRepository: PackageReviewRepository,
): OpsRepository {
  return {
    async listControlPlaneDeployments() {
      const rows = await queryD1Objects<D1InventoryQueryRow>(
        db,
        `${D1_INVENTORY_QUERY} ORDER BY deployments.updated_at DESC, deployments.id DESC`,
      );

      return rows.map((row) => mapInventoryRow(mapD1InventoryRow(row)));
    },

    async getControlPlaneDeploymentDetail(deploymentRecordId) {
      return await getControlPlaneDeploymentDetailForD1(db, deploymentRecordId);
    },

    async listCertificationWorkflowStatuses() {
      return await listCertificationWorkflowStatusesForD1(db);
    },

    async getLatestOfficialCertificationEvidence() {
      return await getLatestOfficialCertificationEvidenceForD1(db);
    },

    async getLatestBrokerVerificationStatus() {
      return await getLatestBrokerVerificationStatusForD1(db);
    },

    async recordBrokerVerificationRun(input) {
      await recordBrokerVerificationRunForD1(db, input);
    },

    async getRetryableGradePublicationLookup(attemptId) {
      return await getRetryableGradePublicationLookupForD1(db, attemptId);
    },

    async getPlacementAuditSnapshot(placementId) {
      return await packageReviewRepository.requirePlacementAuditSnapshotById(placementId);
    },
  };
}
