import { assertEquals, assertExists } from '@std/assert';
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from '../test_helpers/postgres.ts';
import { createOpsRepositoryForTest } from './repository_test_core_support.ts';

Deno.test('ops repository records broker verification runs and returns the latest internal result separately from the latest official certification result', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      source: 'manual',
      scope: 'canvasLti13LaunchAgsNrps',
      status: 'passed',
      certificationState: null,
      summary: 'Manual verification passed for the supported Canvas path.',
      detailUrl: 'https://example.test/verification/manual-pass',
      checkedAt: '2026-03-24T12:50:00Z',
    });
    await repository.recordBrokerVerificationRun({
      source: 'ci',
      scope: 'canvasLti13LaunchAgsNrps',
      status: 'failed',
      certificationState: null,
      summary: 'Latest CI verification failed on the AGS publish step.',
      detailUrl: 'https://example.test/verification/ci-failure',
      checkedAt: '2026-03-24T12:55:00Z',
    });
    await repository.recordBrokerVerificationRun({
      source: '1edtech',
      scope: 'canvasLti13LaunchAgsNrps',
      status: 'passed',
      certificationState: 'ltiAdvantageCertified',
      summary: '1EdTech lists Lantern as LTI Advantage Certified.',
      detailUrl: 'https://example.test/verification/1edtech-directory',
      checkedAt: '2026-03-24T13:00:00Z',
    });

    const verification = await repository.getLatestBrokerVerificationStatus();

    assertExists(verification);
    assertEquals(verification.supportedPath, 'canvasLti13LaunchAgsNrps');
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
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      source: '1edtech',
      scope: 'canvasLti13LaunchAgsNrps',
      status: 'notCertified',
      certificationState: null,
      summary: '1EdTech does not list Lantern in the certification directory.',
      detailUrl: 'https://example.test/verification/1edtech-directory',
      checkedAt: '2026-03-24T12:40:00Z',
    });
    await repository.recordBrokerVerificationRun({
      source: 'manual',
      scope: 'canvasLti13LaunchAgsNrps',
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

Deno.test('ops repository does not infer an official certification claim from internal verification evidence alone', async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await repository.recordBrokerVerificationRun({
      source: 'ci',
      scope: 'canvasLti13LaunchAgsNrps',
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
