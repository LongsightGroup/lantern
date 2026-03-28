import { assertEquals, assertExists } from '@std/assert';
import { buildCanvasDeploymentBinding } from '../test_helpers/lti.ts';
import { buildPackageVersionRecord } from '../test_helpers/package_review.ts';
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from '../test_helpers/postgres.ts';
import {
  createOpsRepositoryForTest,
  insertDeployment,
  insertPackageVersion,
} from './repository_test_core_support.ts';
import { seedOpsRepositoryFixtures } from './repository_test_seed.ts';

const MOODLE_SUPPORTED_SCOPE = 'lti13LaunchAgsScore';
const SAKAI_SUPPORTED_SCOPE = 'lti13LaunchAgsScore';

Deno.test('ops repository records broker verification runs and returns the latest internal result separately from the latest official certification result', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedCanvasBrokerVerificationTarget(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: 'manual',
      scope: 'lti13LaunchAgsNrps',
      status: 'passed',
      certificationState: null,
      summary: 'Manual verification passed for the supported Canvas path.',
      detailUrl: 'https://example.test/verification/manual-pass',
      checkedAt: '2026-03-24T12:50:00Z',
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: 'ci',
      scope: 'lti13LaunchAgsNrps',
      status: 'failed',
      certificationState: null,
      summary: 'Latest CI verification failed on the AGS publish step.',
      detailUrl: 'https://example.test/verification/ci-failure',
      checkedAt: '2026-03-24T12:55:00Z',
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: null,
      source: '1edtech',
      scope: 'lti13LaunchAgsNrps',
      status: 'passed',
      certificationState: 'ltiAdvantageCertified',
      summary: '1EdTech lists Lantern as LTI Advantage Certified.',
      detailUrl: 'https://example.test/verification/1edtech-directory',
      checkedAt: '2026-03-24T13:00:00Z',
    });

    const verification = await repository.getLatestBrokerVerificationStatus();

    assertExists(verification);
    assertEquals(verification.supportedPath, 'lti13LaunchAgsNrps');
    assertEquals(verification.internal?.source, 'ci');
    assertEquals(verification.internal?.status, 'failed');
    assertEquals(
      verification.internal?.summary,
      'Latest CI verification failed on the AGS publish step.',
    );
    assertEquals(
      verification.internal?.evidenceUrl,
      'https://example.test/verification/ci-failure',
    );
    assertEquals(verification.official.state, 'ltiAdvantageCertified');
    assertEquals(
      verification.official.directoryUrl,
      'https://example.test/verification/1edtech-directory',
    );
    assertEquals(verification.official.checkedAt, '2026-03-24T13:00:00.000Z');
  });
});

Deno.test('ops repository keeps internal verification evidence distinct from an older official not-certified result', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedCanvasBrokerVerificationTarget(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      deploymentRecordId: null,
      source: '1edtech',
      scope: 'lti13LaunchAgsNrps',
      status: 'notCertified',
      certificationState: null,
      summary: '1EdTech does not list Lantern in the certification directory.',
      detailUrl: 'https://example.test/verification/1edtech-directory',
      checkedAt: '2026-03-24T12:40:00Z',
    });
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: 'manual',
      scope: 'lti13LaunchAgsNrps',
      status: 'passed',
      certificationState: null,
      summary: 'Manual launch, AGS, and NRPS verification passed.',
      detailUrl: 'https://example.test/verification/manual-pass',
      checkedAt: '2026-03-24T12:55:00Z',
    });

    const verification = await repository.getLatestBrokerVerificationStatus();

    assertExists(verification);
    assertEquals(verification.internal?.source, 'manual');
    assertEquals(verification.internal?.status, 'passed');
    assertEquals(verification.internal?.checkedAt, '2026-03-24T12:55:00.000Z');
    assertEquals(verification.official.state, 'notCertified');
    assertEquals(verification.official.checkedAt, '2026-03-24T12:40:00.000Z');
    assertEquals(
      verification.official.directoryUrl,
      'https://example.test/verification/1edtech-directory',
    );
  });
});

Deno.test('ops repository keeps broker verification scoped to the exact deployment and supported path', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedOpsRepositoryFixtures(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 2,
      source: 'manual',
      scope: MOODLE_SUPPORTED_SCOPE,
      status: 'passed',
      certificationState: null,
      summary: 'Moodle launch and AGS smoke verification passed.',
      detailUrl: 'https://example.test/verification/moodle-manual-pass',
      checkedAt: '2026-03-24T13:05:00Z',
    } as Parameters<typeof repository.recordBrokerVerificationRun>[0]);
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 2,
      source: 'ci',
      scope: MOODLE_SUPPORTED_SCOPE,
      status: 'failed',
      certificationState: null,
      summary: 'Latest Moodle CI verification failed on the AGS score publish.',
      detailUrl: 'https://example.test/verification/moodle-ci-failure',
      checkedAt: '2026-03-24T13:10:00Z',
    } as Parameters<typeof repository.recordBrokerVerificationRun>[0]);
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: null,
      source: '1edtech',
      scope: MOODLE_SUPPORTED_SCOPE,
      status: 'notCertified',
      certificationState: null,
      summary: '1EdTech does not list Lantern for the Moodle verification path.',
      detailUrl: 'https://example.test/verification/moodle-directory',
      checkedAt: '2026-03-24T13:15:00Z',
    } as Parameters<typeof repository.recordBrokerVerificationRun>[0]);
    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 3,
      source: 'manual',
      scope: SAKAI_SUPPORTED_SCOPE,
      status: 'pending',
      certificationState: null,
      summary: 'Sakai launch and AGS smoke verification is pending follow-up.',
      detailUrl: 'https://example.test/verification/sakai-pending',
      checkedAt: '2026-03-24T13:20:00Z',
    } as Parameters<typeof repository.recordBrokerVerificationRun>[0]);

    const rows = await repository.listControlPlaneDeployments();
    const rowsByLms = new Map(rows.map((row) => [row.binding?.lms ?? 'missing', row] as const));
    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);
    const sakaiDetail = await repository.getControlPlaneDeploymentDetail(3);

    assertEquals(rowsByLms.get('canvas')?.brokerVerification?.supportedPath, 'lti13LaunchAgsNrps');
    assertEquals(
      rowsByLms.get('moodle')?.brokerVerification?.supportedPath,
      MOODLE_SUPPORTED_SCOPE,
    );
    assertEquals(rowsByLms.get('moodle')?.brokerVerification?.internal?.source, 'ci');
    assertEquals(rowsByLms.get('moodle')?.brokerVerification?.official.state, 'notCertified');
    assertEquals(rowsByLms.get('sakai')?.brokerVerification?.supportedPath, SAKAI_SUPPORTED_SCOPE);
    assertEquals(rowsByLms.get('sakai')?.brokerVerification?.internal?.status, 'pending');

    assertExists(moodleDetail);
    assertEquals(moodleDetail.brokerVerification?.supportedPath, MOODLE_SUPPORTED_SCOPE);
    assertEquals(moodleDetail.brokerVerification?.internal?.source, 'ci');
    assertEquals(moodleDetail.brokerVerification?.official.state, 'notCertified');
    assertEquals(
      moodleDetail.brokerVerification?.official.directoryUrl,
      'https://example.test/verification/moodle-directory',
    );

    assertExists(sakaiDetail);
    assertEquals(sakaiDetail.brokerVerification?.supportedPath, SAKAI_SUPPORTED_SCOPE);
    assertEquals(sakaiDetail.brokerVerification?.internal?.status, 'pending');
    assertEquals(sakaiDetail.brokerVerification?.official.state, 'notCertified');
  });
});

Deno.test('ops repository does not infer an official certification claim from internal verification evidence alone', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedCanvasBrokerVerificationTarget(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      deploymentRecordId: 1,
      source: 'ci',
      scope: 'lti13LaunchAgsNrps',
      status: 'passed',
      certificationState: null,
      summary: 'CI verification passed for the supported broker path.',
      detailUrl: 'https://example.test/verification/ci-pass',
      checkedAt: '2026-03-24T12:45:00Z',
    });

    const verification = await repository.getLatestBrokerVerificationStatus();

    assertExists(verification);
    assertEquals(verification.internal?.status, 'passed');
    assertEquals(verification.official.state, 'notCertified');
    assertEquals(verification.official.checkedAt, null);
    assertEquals(verification.official.directoryUrl, null);
  });
});

async function seedCanvasBrokerVerificationTarget(
  pool: Parameters<typeof createOpsRepositoryForTest>[0],
): Promise<void> {
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: 'approved',
    reviewedAt: '2026-03-23T18:05:00Z',
  });
  const client = await pool.connect();

  try {
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
      },
    );
  } finally {
    client.release();
  }
}
