import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { EXAMPLE_SNAPSHOT_ROOT } from './app_test_support.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('GET /admin/packages/:appId/versions/:version/preview renders fake launch context for approved reviewed versions', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 42,
        appId: 'chapter-4-asteroids',
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-25T00:40:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.1.0',
          title: 'Chapter 4 Asteroids',
          preview: {
            fixtures_file: '/preview/fixtures.json',
            tests_file: '/preview/tests.json',
          },
        },
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: 'sha256:example-approved-preview',
        },
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0/preview');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Governed preview launch');
  assertStringIncludes(body, 'course_demo');
  assertStringIncludes(body, 'chapter-4-asteroids');
  assertStringIncludes(body, 'action="/admin/packages/chapter-4-asteroids/versions/0.1.0/preview"');
});

Deno.test('GET /admin/packages/:appId/versions/:version/preview fails clearly for non-approved versions with no runtime redirect', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 43,
        appId: 'chapter-4-asteroids',
        version: '0.2.0',
        approvalStatus: 'pending',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/packages/chapter-4-asteroids/versions/0.2.0/preview');

  assertEquals(response.status, 409);
  assertEquals(response.headers.get('location'), null);
  assertStringIncludes(await response.text(), 'Preview requires an approved package version.');
});

Deno.test('POST /admin/packages/:appId/versions/:version/preview creates a preview runtime session and redirects to Lantern runtime', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 44,
        appId: 'chapter-4-asteroids',
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-25T01:10:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.1.0',
          title: 'Chapter 4 Asteroids',
          preview: {
            fixtures_file: '/preview/fixtures.json',
            tests_file: '/preview/tests.json',
          },
        },
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: 'sha256:example-approved-preview-post',
        },
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    'http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0/preview',
    { method: 'POST', headers: { Origin: 'http://localhost' } },
  );

  assertEquals(response.status, 303);
  const location = response.headers.get('location') ?? '';
  assertStringIncludes(location, '/runtime/sessions/');
  assertStringIncludes(location, '?token=');

  const runtimeLocation = new URL(`http://localhost${location}`);
  const sessionId = runtimeLocation.pathname.split('/').at(-1) ?? '';
  const session = await repository.getRuntimeSessionById(sessionId);
  const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-preview');

  assertEquals(session?.services.ags, null);
  assertEquals(session?.services.nrps, null);
  assertEquals(session?.deploymentSlug, 'chapter-4-asteroids-preview');
  assertEquals(session?.launch.courseId, 'course_demo');
  assertEquals(session?.launch.activityId, 'chapter-4-asteroids');
  assertEquals(session?.sessionToken, runtimeLocation.searchParams.get('token'));
  assertEquals(deployment?.enabledPackageVersionId, 44);
  assertEquals(deployment?.enabledPackageVersion, '0.1.0');
});

Deno.test('POST /admin/packages/:appId/versions/:version/preview writes durable preview launch evidence linked to the preview session', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 45,
        appId: 'chapter-4-asteroids',
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-25T01:10:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.1.0',
          title: 'Chapter 4 Asteroids',
          preview: {
            fixtures_file: '/preview/fixtures.json',
            tests_file: '/preview/tests.json',
          },
        },
        artifact: {
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          digest: 'sha256:example-approved-preview-evidence',
        },
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    'http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0/preview',
    { method: 'POST', headers: { Origin: 'http://localhost' } },
  );
  const location = response.headers.get('location') ?? '';
  const runtimeLocation = new URL(`http://localhost${location}`);
  const runtimeSessionId = runtimeLocation.pathname.split('/').at(-1) ?? '';
  const auditEvents = await repository.listAuditEventsByEventType('preview.launch');
  const previewSessionId = String(auditEvents[0]?.detail.previewSessionId ?? '');
  const previewEvidence = await repository.listPreviewEvidence(previewSessionId);

  assertEquals(response.status, 303);
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.status, 'succeeded');
  assertEquals(String(auditEvents[0]?.detail.runtimeSessionId ?? ''), runtimeSessionId);
  assertEquals(previewEvidence.length, 1);
  assertEquals(previewEvidence[0]?.eventType, 'preview.launch');
});
