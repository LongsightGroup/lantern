import { assertEquals, assertExists } from '@std/assert';
import { buildAuditEventRecord } from '../test_helpers/package_review.ts';
import { insertAuditEvent } from './repository_test_core_support.ts';
import { withSeededOpsRepositoryTest } from './repository_inventory_test_support.ts';

Deno.test('ops repository diagnostics include reviewer events while keeping launch, NRPS, and AGS diagnostics intact', async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 4,
          eventType: 'reviewer.preview_viewed',
          actorType: 'user',
          actorId: 'reviewer-123',
          status: 'succeeded',
          summary: 'Reviewer opened placement evidence.',
          detail: { placementId: 'placement-ops-123' },
          occurredAt: '2026-03-24T12:36:00Z',
        }),
      );
    } finally {
      client.release();
    }

    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.diagnostics.length, 4);
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'launch.accepted'),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'deployment.nrps_verified'),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'grade_publish.failed'),
      true,
    );
    assertEquals(
      detail.diagnostics.some((item) => item.eventType === 'reviewer.preview_viewed'),
      true,
    );
    assertEquals(
      detail.diagnostics.find((item) => item.eventType === 'reviewer.preview_viewed')?.kind,
      'reviewer',
    );
  });
});

Deno.test('ops repository diagnostics keep broker verification wording LMS-neutral with deployment context', async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 20,
          deploymentRecordId: 2,
          eventType: 'broker_verification.failed',
          status: 'failed',
          summary: 'Moodle broker verification failed.',
          detail: {
            lms: 'moodle',
          },
          occurredAt: '2026-03-24T12:37:00Z',
        }),
      );
    } finally {
      client.release();
    }

    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);

    assertExists(moodleDetail);
    assertEquals(
      moodleDetail.diagnostics.find((item) => item.eventType === 'broker_verification.failed')
        ?.operatorSummary,
      'Broker verification failed for the saved Moodle deployment path.',
    );
  });
});
