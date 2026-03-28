import { assertEquals, assertExists } from '@std/assert';
import { buildAuditEventRecord } from '../test_helpers/package_review.ts';
import { insertAuditEvent } from './repository_test_core_support.ts';
import { withSeededOpsRepositoryTest } from './repository_inventory_test_support.ts';

Deno.test('ops repository returns deployment detail snapshots with the latest launch, NRPS read, AGS publish, and diagnostics feed', async () => {
  await withSeededOpsRepositoryTest(async (_pool, repository) => {
    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.inventory.deploymentSlug, 'chapter-4-asteroids-pilot');
    assertEquals(detail.latestLaunch?.attemptId, 'attempt-123');
    assertEquals(detail.latestNrpsRead?.status, 'succeeded');
    assertEquals(detail.latestGradePublish?.errorCode, 'canvas_score_rejected');
    assertEquals(detail.diagnostics.length, 3);
  });
});

Deno.test('ops repository returns the latest deployment-scoped AGS smoke verification result for the viewed deployment', async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 30,
          deploymentRecordId: 2,
          eventType: 'deployment.ags_smoke_verified',
          status: 'failed',
          summary: 'Moodle AGS smoke verification failed.',
          detail: {
            lms: 'moodle',
            agsCapable: true,
            publicationStatus: 'failed',
            lineItemUrl: 'https://moodle.example/mod/lti/services.php/2/lineitems/9',
            error: {
              code: 'score_publish_failed',
              message: 'Moodle score publish failed with status 500.',
            },
          },
          occurredAt: '2026-03-24T12:38:00Z',
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 31,
          deploymentRecordId: 3,
          eventType: 'deployment.ags_smoke_verified',
          status: 'succeeded',
          summary: 'Sakai AGS smoke verification succeeded.',
          detail: {
            lms: 'sakai',
            agsCapable: true,
            publicationStatus: 'succeeded',
            lineItemUrl: 'https://sakai.example/direct/lti/lineitems/course-42/items/9',
          },
          occurredAt: '2026-03-24T12:39:00Z',
        }),
      );
    } finally {
      client.release();
    }

    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);
    const sakaiDetail = await repository.getControlPlaneDeploymentDetail(3);

    assertExists(moodleDetail);
    assertEquals(moodleDetail.latestAgsSmoke?.status, 'failed');
    assertEquals(moodleDetail.latestAgsSmoke?.summary, 'Moodle AGS smoke verification failed.');
    assertEquals(moodleDetail.latestAgsSmoke?.detail.lms, 'moodle');
    assertEquals(moodleDetail.latestAgsSmoke?.detail.agsCapable, true);
    assertEquals(moodleDetail.latestAgsSmoke?.detail.publicationStatus, 'failed');
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.lineItemUrl,
      'https://moodle.example/mod/lti/services.php/2/lineitems/9',
    );

    assertExists(sakaiDetail);
    assertEquals(sakaiDetail.latestAgsSmoke?.status, 'succeeded');
    assertEquals(sakaiDetail.latestAgsSmoke?.summary, 'Sakai AGS smoke verification succeeded.');
    assertEquals(sakaiDetail.latestAgsSmoke?.detail.lms, 'sakai');
    assertEquals(sakaiDetail.latestAgsSmoke?.detail.publicationStatus, 'succeeded');
  });
});
