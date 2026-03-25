import type { Pool, PoolClient } from '@db/postgres';
import { createPackageReviewRepository } from '../package_review/repository.ts';
import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
  ControlPlaneDiagnosticItem,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  RetryableGradePublicationLookup,
} from './types.ts';
import {
  DIAGNOSTICS_QUERY,
  INSERT_BROKER_VERIFICATION_RUN_QUERY,
  INVENTORY_BASE_QUERY,
  INVENTORY_ORDER_BY,
  LATEST_GRADE_PUBLICATION_QUERY,
  LATEST_INTERNAL_BROKER_VERIFICATION_QUERY,
  LATEST_LAUNCH_QUERY,
  LATEST_NRPS_QUERY,
  LATEST_OFFICIAL_BROKER_VERIFICATION_QUERY,
  RETRYABLE_GRADE_PUBLICATION_LOOKUP_QUERY,
  SUPPORTED_BROKER_SCOPE,
} from './repository_queries.ts';
import type {
  ActivitySnapshotRow,
  DiagnosticRow,
  GradePublicationSnapshotRow,
  InternalBrokerVerificationRow,
  InventoryQueryRow,
  OpsRepository,
  OfficialBrokerVerificationRow,
  RecordBrokerVerificationRunInput,
  RetryLookupRow,
} from './repository_types.ts';
import {
  assertBrokerVerificationRunInput,
  mapActivitySnapshotRow,
  mapBrokerVerificationStatusRows,
  mapDiagnosticRows,
  mapGradePublicationSnapshotRow,
  mapInventoryRow,
} from './repository_mapping.ts';
import { mapRetryLookupRow } from './repository_retry_mapping.ts';

export type { OpsRepository, RecordBrokerVerificationRunInput } from './repository_types.ts';

export function createOpsRepository(pool: Pool): OpsRepository {
  const packageReviewRepository = createPackageReviewRepository(pool);

  return {
    async listControlPlaneDeployments() {
      return await withClient(pool, async (client) => {
        const [result, brokerVerification] = await Promise.all([
          client.queryObject<InventoryQueryRow>({
            text: `${INVENTORY_BASE_QUERY}\n${INVENTORY_ORDER_BY}`,
            camelCase: true,
          }),
          getLatestBrokerVerificationStatusForClient(client),
        ]);

        return result.rows.map((row) => mapInventoryRow(row, brokerVerification));
      });
    },

    async getControlPlaneDeploymentDetail(deploymentRecordId) {
      return await withClient(pool, async (client) => {
        const brokerVerification = await getLatestBrokerVerificationStatusForClient(client);
        const inventory = await getInventoryRow(client, deploymentRecordId, brokerVerification);

        if (inventory === null) {
          return null;
        }

        const [latestLaunch, latestNrpsRead, latestGradePublish] = await Promise.all([
          getActivitySnapshot(client, LATEST_LAUNCH_QUERY, deploymentRecordId),
          getActivitySnapshot(client, LATEST_NRPS_QUERY, deploymentRecordId),
          getLatestGradePublication(client, deploymentRecordId),
        ]);
        const retryableGradePublication =
          latestGradePublish?.status === 'failed'
            ? await getRetryableGradePublicationLookupForClient(
                client,
                latestGradePublish.attemptId,
              )
            : null;
        const diagnostics = await listDiagnostics(
          client,
          deploymentRecordId,
          retryableGradePublication?.attemptId ?? null,
        );

        return {
          inventory,
          latestLaunch,
          latestNrpsRead,
          latestGradePublish,
          pilotUsage: inventory.pilotUsage,
          diagnostics,
          retryableGradePublication,
          brokerVerification: inventory.brokerVerification,
        };
      });
    },

    async getLatestBrokerVerification() {
      return await this.getLatestBrokerVerificationStatus();
    },

    async getLatestBrokerVerificationStatus() {
      return await withClient(
        pool,
        async (client) => await getLatestBrokerVerificationStatusForClient(client),
      );
    },

    async recordBrokerVerificationRun(input) {
      return await withClient(
        pool,
        async (client) => await recordBrokerVerificationRunForClient(client, input),
      );
    },

    async getRetryableGradePublicationLookup(attemptId) {
      return await withClient(
        pool,
        async (client) => await getRetryableGradePublicationLookupForClient(client, attemptId),
      );
    },

    async getPlacementAuditSnapshot(placementId) {
      return await packageReviewRepository.requirePlacementAuditSnapshotById(placementId);
    },
  };
}

async function getInventoryRow(
  client: PoolClient,
  deploymentRecordId: number,
  brokerVerification: BrokerVerificationStatus | null,
): Promise<ControlPlaneDeploymentInventoryRow | null> {
  const result = await client.queryObject<InventoryQueryRow>({
    text: `${INVENTORY_BASE_QUERY}
      WHERE deployments.id = $1
      ${INVENTORY_ORDER_BY}`,
    args: [deploymentRecordId],
    camelCase: true,
  });

  return result.rows[0] ? mapInventoryRow(result.rows[0], brokerVerification) : null;
}

async function getActivitySnapshot(
  client: PoolClient,
  text: string,
  deploymentRecordId: number,
): Promise<DeploymentActivitySnapshot | null> {
  const result = await client.queryObject<ActivitySnapshotRow>({
    text,
    args: [deploymentRecordId],
    camelCase: true,
  });
  const row = result.rows[0];

  return row ? mapActivitySnapshotRow(row) : null;
}

async function getLatestGradePublication(
  client: PoolClient,
  deploymentRecordId: number,
): Promise<DeploymentGradePublicationSnapshot | null> {
  const result = await client.queryObject<GradePublicationSnapshotRow>({
    text: LATEST_GRADE_PUBLICATION_QUERY,
    args: [deploymentRecordId],
    camelCase: true,
  });
  const row = result.rows[0];

  return row ? mapGradePublicationSnapshotRow(row) : null;
}

async function listDiagnostics(
  client: PoolClient,
  deploymentRecordId: number,
  retryableAttemptId: string | null,
): Promise<ControlPlaneDiagnosticItem[]> {
  const result = await client.queryObject<DiagnosticRow>({
    text: DIAGNOSTICS_QUERY,
    args: [deploymentRecordId],
    camelCase: true,
  });

  return mapDiagnosticRows(result.rows, retryableAttemptId);
}

async function getLatestBrokerVerificationStatusForClient(
  client: PoolClient,
): Promise<BrokerVerificationStatus | null> {
  const [internalResult, officialResult] = await Promise.all([
    client.queryObject<InternalBrokerVerificationRow>({
      text: LATEST_INTERNAL_BROKER_VERIFICATION_QUERY,
      args: [SUPPORTED_BROKER_SCOPE],
      camelCase: true,
    }),
    client.queryObject<OfficialBrokerVerificationRow>({
      text: LATEST_OFFICIAL_BROKER_VERIFICATION_QUERY,
      args: [SUPPORTED_BROKER_SCOPE],
      camelCase: true,
    }),
  ]);

  return mapBrokerVerificationStatusRows(
    internalResult.rows[0] ?? null,
    officialResult.rows[0] ?? null,
  );
}

async function recordBrokerVerificationRunForClient(
  client: PoolClient,
  input: RecordBrokerVerificationRunInput,
): Promise<void> {
  assertBrokerVerificationRunInput(input);
  await client.queryArray({
    text: INSERT_BROKER_VERIFICATION_RUN_QUERY,
    args: [
      null,
      input.scope,
      input.source,
      input.status,
      input.summary,
      input.detailUrl,
      input.certificationState,
      input.checkedAt,
    ],
  });
}

async function getRetryableGradePublicationLookupForClient(
  client: PoolClient,
  attemptId: string,
): Promise<RetryableGradePublicationLookup | null> {
  const result = await client.queryObject<RetryLookupRow>({
    text: RETRYABLE_GRADE_PUBLICATION_LOOKUP_QUERY,
    args: [attemptId],
    camelCase: true,
  });
  const row = result.rows[0];

  return row ? mapRetryLookupRow(row) : null;
}

async function withClient<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    return await run(client);
  } finally {
    client.release();
  }
}
