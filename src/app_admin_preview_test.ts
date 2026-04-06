import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  EXAMPLE_SNAPSHOT_ROOT,
  getReferenceAppSnapshotRoot,
  withRuntimeOriginEnv,
} from './app_test_support.ts';
import {
  buildAdminPreviewSessionRecord,
  buildAuthoringPreviewSessionRecord,
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('GET /admin/packages/:appId/versions/:version/preview renders test-launch defaults for approved reviewed versions', async () => {
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

  assertStringIncludes(body, 'Test Launch');
  assertStringIncludes(body, 'course_demo');
  assertStringIncludes(body, 'chapter-4-asteroids');
  assertStringIncludes(body, 'name="userRole"');
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
  assertStringIncludes(await response.text(), 'Test launch requires an approved package version.');
});

Deno.test('POST /admin/packages/:appId/versions/:version/preview creates a runtime session from submitted test-launch values and redirects to Lantern runtime', async () => {
  await withRuntimeOriginEnv(async () => {
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
    const formData = new FormData();
    formData.set('userRole', 'instructor');
    formData.set('courseId', 'physics-101');
    formData.set('assignmentId', '');
    formData.set('activityId', 'asteroids-boss-stage');

    const response = await app.request(
      'https://lantern.example/admin/packages/chapter-4-asteroids/versions/0.1.0/preview',
      {
        method: 'POST',
        headers: { Origin: 'https://lantern.example' },
        body: formData,
      },
    );

    assertEquals(response.status, 303);
    const location = response.headers.get('location') ?? '';
    assertStringIncludes(location, 'https://runtime.lantern.example/runtime/sessions/');
    assertStringIncludes(location, '?token=');

    const runtimeLocation = new URL(location);
    const sessionId = runtimeLocation.pathname.split('/').at(-1) ?? '';
    const session = await repository.getRuntimeSessionById(sessionId);
    const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-preview');

    assertEquals(session?.services.ags, null);
    assertEquals(session?.services.nrps, null);
    assertEquals(session?.deploymentSlug, 'chapter-4-asteroids-preview');
    assertEquals(session?.launch.userRole, 'instructor');
    assertEquals(session?.launch.courseId, 'physics-101');
    assertEquals(session?.launch.assignmentId ?? null, null);
    assertEquals(session?.launch.activityId, 'asteroids-boss-stage');
    assertEquals(session?.sessionToken, runtimeLocation.searchParams.get('token'));
    assertEquals(deployment?.enabledPackageVersionId, 44);
    assertEquals(deployment?.enabledPackageVersion, '0.1.0');
  });
});

Deno.test('POST /admin/packages/:appId/versions/:version/preview writes durable preview launch evidence linked to the preview session', async () => {
  await withRuntimeOriginEnv(async () => {
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
    const formData = new FormData();
    formData.set('userRole', 'learner');
    formData.set('courseId', 'course_demo');
    formData.set('assignmentId', 'assignment_demo');
    formData.set('activityId', 'chapter-4-asteroids');

    const response = await app.request(
      'https://lantern.example/admin/packages/chapter-4-asteroids/versions/0.1.0/preview',
      {
        method: 'POST',
        headers: { Origin: 'https://lantern.example' },
        body: formData,
      },
    );
    const location = response.headers.get('location') ?? '';
    const runtimeLocation = new URL(location);
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
});

Deno.test("POST /admin/packages/:appId/versions/:version/preview launches committed quick-study through Lantern's governed runtime path", async () => {
  await withRuntimeOriginEnv(async () => {
    const snapshotRoot = getReferenceAppSnapshotRoot('quick-study');
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 46,
          appId: 'quick-study',
          version: '0.1.0',
          title: 'Quick Study',
          description:
            'A calm flashcard deck that turns short review sessions into a streak-driven study ritual.',
          approvalStatus: 'approved',
          reviewedAt: '2026-04-05T14:05:00Z',
          grading: {
            mode: 'completion',
            rubricFile: null,
            maxScore: 100,
          },
          manifestJson: {
            app_id: 'quick-study',
            version: '0.1.0',
            title: 'Quick Study',
            preview: {
              fixtures_file: '/preview/fixtures.json',
              tests_file: '/preview/tests.json',
            },
          },
          artifact: {
            snapshotRoot,
            manifestPath: `${snapshotRoot}/manifest.json`,
            entrypointPath: `${snapshotRoot}/dist/index.html`,
            digest: 'sha256:quick-study-approved-preview',
          },
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });
    const formData = new FormData();
    formData.set('userRole', 'learner');
    formData.set('courseId', 'course_demo');
    formData.set('assignmentId', 'assignment_demo');
    formData.set('activityId', 'quick-study');

    const response = await app.request(
      'https://lantern.example/admin/packages/quick-study/versions/0.1.0/preview',
      {
        method: 'POST',
        headers: { Origin: 'https://lantern.example' },
        body: formData,
      },
    );

    assertEquals(response.status, 303);
    const runtimeLocation = new URL(response.headers.get('location') ?? '');
    const sessionId = runtimeLocation.pathname.split('/').at(-1) ?? '';
    const session = await repository.getRuntimeSessionById(sessionId);

    assertEquals(session?.deploymentSlug, 'quick-study-preview');
    assertEquals(session?.appId, 'quick-study');
    assertEquals(session?.contentPath, `${snapshotRoot}/content/activity.json`);
    assertEquals(session?.launch.userRole, 'learner');
    assertEquals(session?.launch.activityId, 'quick-study');
  });
});

Deno.test('GET /admin/packages/:appId/versions/:version/preview keeps reviewer history tied to admin test launches', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 48,
        appId: 'chapter-4-asteroids',
        version: '0.4.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-04-01T09:00:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.4.0',
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
          digest: 'sha256:example-approved-preview-history-filter',
        },
      }),
    ],
    previewSessions: [
      buildAdminPreviewSessionRecord({
        sessionId: 'preview-session-admin-history',
        packageVersionId: 48,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.4.0',
        packageTitle: 'Chapter 4 Asteroids',
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        createdAt: '2026-04-01T09:10:00Z',
      }),
      buildAuthoringPreviewSessionRecord({
        sessionId: 'preview-session-authoring-history',
        packageVersionId: 48,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.4.0',
        packageTitle: 'Chapter 4 Asteroids',
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        createdAt: '2026-04-01T09:15:00Z',
      }),
    ],
    previewEvidence: [
      buildPreviewEvidenceRecord({
        id: 1,
        previewSessionId: 'preview-session-admin-history',
        summary: 'Admin reviewer launch evidence',
      }),
      buildPreviewEvidenceRecord({
        id: 2,
        previewSessionId: 'preview-session-authoring-history',
        summary: 'Authoring preview evidence',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/packages/chapter-4-asteroids/versions/0.4.0/preview');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'preview-session-admin-history');
  assertStringIncludes(body, 'Admin reviewer launch evidence');
  assertEquals(body.includes('preview-session-authoring-history'), false);
  assertEquals(body.includes('Authoring preview evidence'), false);
});
