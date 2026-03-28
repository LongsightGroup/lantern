import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildMoodleDeploymentBinding } from './test_helpers/lti.ts';

Deno.test('POST /admin/packages/:appId/deployment/pin keeps the selected LMS tab open when the version is missing', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewNotes: 'Ready for pilot.',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 4,
        slug: 'chapter-4-asteroids-moodle',
        label: 'Chapter 4 Asteroids Moodle Deployment',
        enabledPackageVersionId: null,
        enabledPackageVersion: null,
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('lms', 'moodle');

  const response = await app.request(
    'http://localhost/admin/packages/chapter-4-asteroids/deployment/pin',
    {
      method: 'POST',
      headers: { Origin: 'http://localhost' },
      body: formData,
    },
  );

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, 'Moodle version pin blocked');
  assertStringIncludes(body, 'Moodle setup');
  assertStringIncludes(body, 'Choose an approved version.');
  assertStringIncludes(body, 'name="packageVersionId"');
  assertStringIncludes(body, 'aria-invalid="true"');
});
