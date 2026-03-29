import type { Pool } from '@db/postgres';
import {
  buildAttemptRecord,
  buildAuditEventRecord,
  buildGradePublicationRecord,
  buildLineItemBindingRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildRuntimeSessionRecord,
  buildSakaiDeploymentBinding,
} from '../test_helpers/lti.ts';
import {
  insertAttempt,
  insertAuditEvent,
  insertBrokerVerificationRun,
  insertDeployment,
  insertGradePublication,
  insertLineItemBinding,
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
      buildCanvasDeploymentBinding(),
      {
        id: 1,
        slug: 'chapter-4-asteroids-pilot',
        label: 'Chapter 4 Asteroids Pilot Deployment',
        updatedAt: '2026-03-24T12:30:00Z',
      },
    );
    await insertDeployment(
      client,
      packageVersion.appId,
      packageVersion.id,
      buildMoodleDeploymentBinding(),
      {
        id: 2,
        slug: 'chapter-4-asteroids-moodle',
        label: 'Chapter 4 Asteroids Moodle Deployment',
        updatedAt: '2026-03-24T12:20:00Z',
      },
    );
    await insertDeployment(
      client,
      packageVersion.appId,
      packageVersion.id,
      buildSakaiDeploymentBinding(),
      {
        id: 3,
        slug: 'chapter-4-asteroids-sakai',
        label: 'Chapter 4 Asteroids Sakai Deployment',
        updatedAt: '2026-03-24T12:10:00Z',
      },
    );
    await insertAttempt(
      client,
      buildAttemptRecord({
        id: 1,
        attemptId: 'attempt-123',
        userId: 'opaque-user-123',
        userDisplayName: 'Ada Lovelace',
        userEmail: 'ada@example.com',
        userLogin: 'adal',
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
        userId: 'opaque-user-999',
        userDisplayName: 'Grace Hopper',
        userEmail: 'grace@example.com',
        userLogin: 'ghopper',
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
    await insertLineItemBinding(
      client,
      buildLineItemBindingRecord({
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
        actorType: 'user',
        actorId: 'opaque-user-123',
        status: 'succeeded',
        summary: 'Accepted Canvas launch.',
        detail: {
          lms: 'canvas',
          userId: 'opaque-user-123',
          userDisplayName: 'Ada Lovelace',
          userEmail: 'ada@example.com',
          userLogin: 'adal',
          contextId: 'course-42',
          resourceLinkId: 'resource-link-123',
        },
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
      scope: 'lti13LaunchAgsNrps',
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
