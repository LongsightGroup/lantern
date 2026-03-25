import type { Pool } from '@db/postgres';
import {
  buildAttemptRecord,
  buildAuditEventRecord,
  buildCanvasLineItemBindingRecord,
  buildGradePublicationRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import { buildDeploymentBinding, buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import {
  insertAttempt,
  insertAuditEvent,
  insertBrokerVerificationRun,
  insertCanvasLineItemBinding,
  insertDeployment,
  insertGradePublication,
  insertPackageVersion,
  insertRuntimeSession,
} from './repository_test_core_support.ts';

export async function seedOpsRepositoryFixtures(pool: Pool): Promise<void> {
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: 'approved',
    reviewedAt: '2026-03-23T18:05:00Z',
  });
  const client = await pool.connect();

  try {
    await client.queryArray('BEGIN');
    await insertPackageVersion(client, packageVersion);
    await insertDeployment(
      client,
      packageVersion.appId,
      packageVersion.id,
      buildDeploymentBinding(),
    );
    await insertAttempt(
      client,
      buildAttemptRecord({
        id: 1,
        attemptId: 'attempt-123',
        status: 'completed',
        completionState: 'completed',
        finalizedAt: '2026-03-24T12:31:00Z',
      }),
    );
    await insertAttempt(
      client,
      buildAttemptRecord({
        id: 2,
        attemptId: 'attempt-999',
        userId: 'canvas-user-999',
        startedAt: '2026-03-24T12:40:00Z',
      }),
    );
    await insertRuntimeSession(
      client,
      buildRuntimeSessionRecord({
        sessionId: 'runtime-session-123',
        attemptId: 'attempt-123',
        createdAt: '2026-03-24T12:30:00Z',
        expiresAt: '2026-03-25T12:30:00Z',
      }),
    );
    await insertRuntimeSession(
      client,
      buildRuntimeSessionRecord({
        sessionId: 'runtime-session-999',
        sessionToken: 'runtime-token-999',
        attemptId: 'attempt-999',
        createdAt: '2026-03-24T12:40:00Z',
        expiresAt: '2026-03-25T12:40:00Z',
      }),
    );
    await insertCanvasLineItemBinding(
      client,
      buildCanvasLineItemBindingRecord({
        id: 1,
        deploymentRecordId: 1,
        packageVersionId: 1,
      }),
    );
    await insertGradePublication(
      client,
      buildGradePublicationRecord({
        id: 1,
        attemptId: 'attempt-123',
        lineItemBindingId: 1,
        status: 'failed',
        gradingProgress: 'Failed',
        publishedAt: null,
        updatedAt: '2026-03-24T12:35:00Z',
        errorCode: 'canvas_score_rejected',
        errorDetail: { httpStatus: 422 },
      }),
    );
    await insertAuditEvent(
      client,
      buildAuditEventRecord({
        id: 1,
        eventType: 'launch.accepted',
        status: 'succeeded',
        summary: 'Accepted Canvas launch.',
        occurredAt: '2026-03-24T12:30:00Z',
      }),
    );
    await insertAuditEvent(
      client,
      buildAuditEventRecord({
        id: 2,
        eventType: 'deployment.nrps_verified',
        status: 'succeeded',
        summary: 'Verified roster access for the deployment.',
        occurredAt: '2026-03-24T12:33:00Z',
        detail: { contextId: 'course-42', memberCount: 2 },
      }),
    );
    await insertAuditEvent(
      client,
      buildAuditEventRecord({
        id: 3,
        eventType: 'grade_publish.failed',
        status: 'failed',
        summary: 'Canvas rejected the score publish.',
        occurredAt: '2026-03-24T12:35:00Z',
        detail: { code: 'canvas_score_rejected', httpStatus: 422 },
      }),
    );
    await insertBrokerVerificationRun(client, {
      deploymentRecordId: 1,
      scope: 'canvasLti13LaunchAgsNrps',
      source: 'manual',
      status: 'passed',
      summary: 'Canvas launch, AGS publish, and NRPS verification passed.',
      detailUrl: 'https://example.test/internal-proof',
      certificationState: null,
      checkedAt: '2026-03-24T12:50:00Z',
    });
    await client.queryArray('COMMIT');
  } catch (error) {
    await client.queryArray('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
