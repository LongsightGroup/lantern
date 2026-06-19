import { assertEquals, assertStringIncludes } from '@std/assert';
import type { Capability } from '../sdk/app-sdk.ts';
import { createApp } from './app.ts';
import { EXAMPLE_SNAPSHOT_ROOT, withRuntimeOriginEnv } from './app_test_support.ts';
import {
  buildAdminPreviewSessionRecord,
  buildAuthoringPreviewSessionRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('test-launch activity log shows durable launch, content-read, attempt, and finalize evidence after reload', async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 46,
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
            digest: 'sha256:example-approved-preview-capability-log',
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

    const launchResponse = await app.request(
      'https://lantern.example/admin/packages/chapter-4-asteroids/versions/0.1.0/preview',
      {
        method: 'POST',
        headers: { Origin: 'https://lantern.example' },
        body: formData,
      },
    );
    const location = launchResponse.headers.get('location') ?? '';
    const runtimeLocation = new URL(location);
    const runtimeSessionId = runtimeLocation.pathname.split('/').at(-1) ?? '';
    const runtimeToken = runtimeLocation.searchParams.get('token') ?? '';
    const runtimeSession = await repository.getRuntimeSessionById(runtimeSessionId);

    await app.request(
      `https://runtime.lantern.example/runtime/sessions/${runtimeSessionId}/content`,
      {
        headers: { Authorization: `Bearer ${runtimeToken}` },
      },
    );
    await app.request(
      `https://runtime.lantern.example/runtime/sessions/${runtimeSessionId}/attempt-events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtimeToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'progress',
          checkpoint: 'preview-wave',
          value: 1,
          timestamp: '2026-03-25T01:12:00Z',
        }),
      },
    );
    await app.request(
      `https://runtime.lantern.example/runtime/sessions/${runtimeSessionId}/finalize`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtimeToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ completionState: 'completed' }),
      },
    );

    const previewPageResponse = await app.request(
      'https://lantern.example/admin/packages/chapter-4-asteroids/versions/0.1.0/preview',
    );
    const previewBody = await previewPageResponse.text();
    const auditEvents = await repository.listAuditEventsByEventType('preview.launch');
    const previewSessionId = String(
      auditEvents.find((event) => String(event.detail.runtimeSessionId ?? '') === runtimeSessionId)
        ?.detail.previewSessionId ?? '',
    );
    const previewEvidence = await repository.listPreviewEvidence(previewSessionId);

    assertEquals(launchResponse.status, 303);
    assertEquals(runtimeSession?.preview?.previewSessionId, previewSessionId);
    assertEquals(previewPageResponse.status, 200);
    assertStringIncludes(previewBody, 'Recent test activity');
    assertStringIncludes(previewBody, 'Started test launch');
    assertStringIncludes(previewBody, 'preview.launch');
    assertStringIncludes(previewBody, 'preview.content_read');
    assertStringIncludes(previewBody, 'preview.attempt_event');
    assertStringIncludes(previewBody, 'preview.finalize');
    assertEquals(
      previewEvidence.map((record) => record.eventType),
      ['preview.launch', 'preview.content_read', 'preview.attempt_event', 'preview.finalize'],
    );
  });
});

Deno.test('GET /admin/packages/:appId/versions/:version/preview records a reviewer action with bounded detail', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 47,
        appId: 'chapter-4-asteroids',
        version: '0.3.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-25T01:10:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.3.0',
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
          digest: 'sha256:example-approved-preview-reviewer-action',
        },
      }),
    ],
    previewSessions: [
      buildAdminPreviewSessionRecord({
        sessionId: 'preview-session-reviewer-action',
        packageVersionId: 47,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.3.0',
        packageTitle: 'Chapter 4 Asteroids',
        capabilities: ['read_launch_context'],
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        launch: {
          userId: 'preview-user-123',
          userRole: 'instructor',
          courseId: 'preview-course-42',
          assignmentId: null,
          activityId: 'preview-activity-9',
        },
        fakeAttemptId: 'preview-attempt-reviewer-action',
        fakeScoreMaximum: 100,
        fixtureData: {
          launch: {
            user_role: 'instructor',
            course_id: 'preview-course-42',
            assignment_id: null,
            activity_id: 'preview-activity-9',
          },
          attempt_id: 'preview-attempt-reviewer-action',
          local_state: null,
        },
        createdAt: '2026-03-25T01:40:00Z',
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    'http://localhost/admin/packages/chapter-4-asteroids/versions/0.3.0/preview',
  );
  const auditEvents = await repository.listAuditEventsByEventType('reviewer.preview_viewed');

  assertEquals(response.status, 200);
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.packageVersionId, 47);
  assertEquals(
    String(auditEvents[0]?.detail.previewSessionId ?? ''),
    'preview-session-reviewer-action',
  );
  assertEquals('runtimeSessionId' in (auditEvents[0]?.detail ?? {}), false);
});

Deno.test('GET /admin/packages/:appId/versions/:version/preview records reviewer detail against the latest admin test launch only', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 49,
        appId: 'chapter-4-asteroids',
        version: '0.5.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-04-01T09:30:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.5.0',
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
          digest: 'sha256:example-approved-preview-reviewer-filter',
        },
      }),
    ],
    previewSessions: [
      buildAdminPreviewSessionRecord({
        sessionId: 'preview-session-reviewer-admin',
        packageVersionId: 49,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.5.0',
        packageTitle: 'Chapter 4 Asteroids',
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        createdAt: '2026-04-01T09:31:00Z',
      }),
      buildAuthoringPreviewSessionRecord({
        sessionId: 'preview-session-reviewer-authoring',
        packageVersionId: 49,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.5.0',
        packageTitle: 'Chapter 4 Asteroids',
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        createdAt: '2026-04-01T09:32:00Z',
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    'http://localhost/admin/packages/chapter-4-asteroids/versions/0.5.0/preview',
  );
  const auditEvents = await repository.listAuditEventsByEventType('reviewer.preview_viewed');

  assertEquals(response.status, 200);
  assertEquals(auditEvents.length, 1);
  assertEquals(
    String(auditEvents[0]?.detail.previewSessionId ?? ''),
    'preview-session-reviewer-admin',
  );
});

Deno.test('test-launch runtime diagnostics show denied capabilities after reload', async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPreviewPackageVersion({
          id: 50,
          version: '0.6.0',
          reviewedAt: '2026-04-01T10:00:00Z',
          capabilities: ['read_launch_context', 'read_activity_content'],
          digest: 'sha256:example-approved-preview-denied-capability',
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });
    const { launchResponse, runtimeSessionId, runtimeToken } = await launchAdminPreview({
      app,
      version: '0.6.0',
    });

    const deniedResponse = await app.request(
      `https://runtime.lantern.example/runtime/sessions/${runtimeSessionId}/local-state`,
      {
        headers: { Authorization: `Bearer ${runtimeToken}` },
      },
    );
    const previewPageResponse = await app.request(
      'https://lantern.example/admin/packages/chapter-4-asteroids/versions/0.6.0/preview',
    );
    const previewBody = await previewPageResponse.text();

    assertEquals(launchResponse.status, 303);
    assertEquals(deniedResponse.status, 409);
    assertEquals(previewPageResponse.status, 200);
    assertStringIncludes(previewBody, 'Runtime diagnostics');
    assertStringIncludes(previewBody, 'Denied app capability');
    assertStringIncludes(previewBody, 'runtime.capability.denied');
    assertStringIncludes(previewBody, 'capability_not_granted');
    assertStringIncludes(previewBody, 'read_local_state');
    assertStringIncludes(previewBody, 'local-state.read');
    assertStringIncludes(
      previewBody,
      `GET /runtime/sessions/${runtimeSessionId}/local-state`,
    );
  });
});

Deno.test('test-launch runtime diagnostics show integrity failures without leaking sensitive request detail', async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPreviewPackageVersion({
          id: 51,
          version: '0.7.0',
          reviewedAt: '2026-04-01T10:10:00Z',
          digest: 'sha256:example-approved-preview-integrity-diagnostic',
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });
    const { launchResponse, runtimeSessionId, runtimeToken } = await launchAdminPreview({
      app,
      version: '0.7.0',
    });

    const missingAssetResponse = await app.request(
      `https://runtime.lantern.example/runtime/sessions/${runtimeSessionId}/files/__token__/${runtimeToken}/dist/missing.js?secret=do-not-render`,
      {
        headers: {
          'cf-ray': 'sensitive-cf-ray',
          'x-forwarded-for': '203.0.113.55',
          'user-agent': 'Sensitive user agent',
        },
      },
    );
    const previewPageResponse = await app.request(
      'https://lantern.example/admin/packages/chapter-4-asteroids/versions/0.7.0/preview',
    );
    const previewBody = await previewPageResponse.text();

    assertEquals(launchResponse.status, 303);
    assertEquals(missingAssetResponse.status, 409);
    assertEquals(previewPageResponse.status, 200);
    assertStringIncludes(previewBody, 'Runtime diagnostics');
    assertStringIncludes(previewBody, 'Blocked runtime integrity check');
    assertStringIncludes(previewBody, 'runtime.session.integrity_failed');
    assertStringIncludes(previewBody, 'runtime_file_invalid');
    assertStringIncludes(previewBody, '/files/__token__/[token]/dist/missing.js');
    assertStringIncludes(previewBody, 'query keys: secret');
    assertEquals(previewBody.includes(runtimeToken), false);
    assertEquals(previewBody.includes('do-not-render'), false);
    assertEquals(previewBody.includes('sensitive-cf-ray'), false);
    assertEquals(previewBody.includes('203.0.113'), false);
    assertEquals(previewBody.includes('Sensitive user agent'), false);
  });
});

Deno.test('test-launch runtime diagnostics exclude authoring preview session failures', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPreviewPackageVersion({
        id: 52,
        version: '0.8.0',
        reviewedAt: '2026-04-01T10:20:00Z',
        digest: 'sha256:example-approved-preview-authoring-diagnostic-filter',
      }),
    ],
    previewSessions: [
      buildAdminPreviewSessionRecord({
        sessionId: 'preview-session-admin-diagnostics',
        packageVersionId: 52,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.8.0',
        packageTitle: 'Chapter 4 Asteroids',
        fakeAttemptId: 'preview-attempt-admin-diagnostics',
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        createdAt: '2026-04-01T10:21:00Z',
      }),
      buildAuthoringPreviewSessionRecord({
        sessionId: 'preview-session-authoring-diagnostics',
        packageVersionId: 52,
        appId: 'chapter-4-asteroids',
        packageVersion: '0.8.0',
        packageTitle: 'Chapter 4 Asteroids',
        fakeAttemptId: 'preview-attempt-authoring-diagnostics',
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        createdAt: '2026-04-01T10:22:00Z',
      }),
    ],
  });
  await repository.recordAuditEvent({
    eventType: 'runtime.capability.denied',
    actorType: 'system',
    actorId: null,
    deploymentRecordId: null,
    packageVersionId: 52,
    attemptId: 'preview-attempt-authoring-diagnostics',
    lineItemBindingId: null,
    status: 'failed',
    summary: 'Denied authoring preview capability.',
    detail: {
      route: 'local-state.read',
      category: 'policyDenied',
      code: 'authoring_preview_denial_should_not_render',
      capability: 'read_local_state',
      sessionId: 'runtime-session-authoring-diagnostics',
    },
    occurredAt: '2026-04-01T10:23:00Z',
  });

  const response = await createApp({ getRepository: () => repository }).request(
    'http://localhost/admin/packages/chapter-4-asteroids/versions/0.8.0/preview',
  );
  const body = await response.text();

  assertEquals(response.status, 200);
  assertStringIncludes(body, 'Runtime diagnostics');
  assertStringIncludes(
    body,
    'No blocked runtime behavior has been recorded for this test launch.',
  );
  assertEquals(body.includes('authoring_preview_denial_should_not_render'), false);
  assertEquals(body.includes('runtime-session-authoring-diagnostics'), false);
});

function buildPreviewPackageVersion(input: {
  id: number;
  version: string;
  reviewedAt: string;
  digest: string;
  capabilities?: Capability[];
}) {
  return buildPackageVersionRecord({
    id: input.id,
    appId: 'chapter-4-asteroids',
    version: input.version,
    approvalStatus: 'approved',
    reviewedAt: input.reviewedAt,
    ...(input.capabilities === undefined ? {} : { capabilities: input.capabilities }),
    manifestJson: {
      app_id: 'chapter-4-asteroids',
      version: input.version,
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
      digest: input.digest,
    },
  });
}

async function launchAdminPreview(input: {
  app: ReturnType<typeof createApp>;
  version: string;
}): Promise<{
  launchResponse: Response;
  runtimeSessionId: string;
  runtimeToken: string;
}> {
  const formData = new FormData();
  formData.set('userRole', 'learner');
  formData.set('courseId', 'course_demo');
  formData.set('assignmentId', 'assignment_demo');
  formData.set('activityId', 'chapter-4-asteroids');

  const launchResponse = await input.app.request(
    `https://lantern.example/admin/packages/chapter-4-asteroids/versions/${input.version}/preview`,
    {
      method: 'POST',
      headers: { Origin: 'https://lantern.example' },
      body: formData,
    },
  );
  const location = launchResponse.headers.get('location') ?? '';
  const runtimeLocation = new URL(location);

  return {
    launchResponse,
    runtimeSessionId: runtimeLocation.pathname.split('/').at(-1) ?? '',
    runtimeToken: runtimeLocation.searchParams.get('token') ?? '',
  };
}
