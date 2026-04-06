import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildCanvasDeploymentBinding, buildMoodleDeploymentBinding } from './test_helpers/lti.ts';

Deno.test('POST /admin/verification rejects internal verification rows that include an official certification state', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('source', 'manual');
  formData.set('deploymentRecordId', '1');
  formData.set('scope', 'lti13LaunchAgsNrps');
  formData.set('workflowKey', 'core');
  formData.set('status', 'passed');
  formData.set('certificationState', 'ltiAdvantageCertified');
  formData.set('summary', 'Manual verification passed.');
  formData.set('checkedAt', '2026-03-24T12:50:00Z');

  const response = await app.request('http://localhost/admin/verification', {
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

Deno.test('POST /admin/verification rejects internal verification rows without an explicit deployment', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 2,
        deploymentSlug: 'chapter-4-asteroids-moodle',
        deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('source', 'manual');
  formData.set('scope', 'lti13LaunchAgsScore');
  formData.set('workflowKey', 'ags');
  formData.set('status', 'passed');
  formData.set('summary', 'Manual verification passed.');
  formData.set('checkedAt', '2026-03-24T12:50:00Z');

  const response = await app.request('http://localhost/admin/verification', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 400);
  const body = await response.text();

  assertStringIncludes(body, 'Verification update blocked');
  assertStringIncludes(
    body,
    'Internal verification runs require an explicit deployment record id.',
  );
});
