import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('POST /admin/packages/verification records a broker verification run and redirects back to the control plane', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 })],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('source', 'manual');
  formData.set('status', 'passed');
  formData.set('summary', 'Manual verification passed for the supported Canvas path.');
  formData.set('detailUrl', 'https://example.test/verification/manual-pass');
  formData.set('checkedAt', '2026-03-24T12:50:00Z');

  const response = await app.request('http://localhost/admin/packages/verification', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get('location'), '/admin/packages');

  const latestVerification = await repository.getLatestBrokerVerification();

  assertEquals(latestVerification?.internal?.source, 'manual');
  assertEquals(latestVerification?.internal?.status, 'passed');
  assertEquals(
    latestVerification?.internal?.summary,
    'Manual verification passed for the supported Canvas path.',
  );
  assertEquals(
    latestVerification?.internal?.evidenceUrl,
    'https://example.test/verification/manual-pass',
  );
  assertEquals(latestVerification?.official.state, 'notCertified');
});

Deno.test('POST /admin/packages/verification rejects internal verification rows that include an official certification state', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 })],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('source', 'manual');
  formData.set('status', 'passed');
  formData.set('certificationState', 'ltiAdvantageCertified');
  formData.set('summary', 'Manual verification passed.');
  formData.set('checkedAt', '2026-03-24T12:50:00Z');

  const response = await app.request('http://localhost/admin/packages/verification', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 400);
  const body = await response.text();

  assertStringIncludes(body, 'Verification update blocked');
  assertStringIncludes(
    body,
    'Internal verification runs cannot carry an official certification state.',
  );
});
