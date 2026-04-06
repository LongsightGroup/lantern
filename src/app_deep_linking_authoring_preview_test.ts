import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  extractHiddenInputValue,
  verifyDeepLinkingResponseJwt,
  withCanvasReturnEnv,
  withRuntimeOriginEnv,
} from './app_test_support.ts';
import { buildDeepLinkingSelectionValue } from './lti/deep_linking.ts';
import { LANTERN_PLACEMENT_CUSTOM_KEY } from './lti/types.ts';
import {
  buildDeepLinkingResourceOption,
  buildDeepLinkingResourceSelection,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildDeepLinkingSessionRecord, buildDeploymentBinding } from './test_helpers/lti.ts';

Deno.test('Deep Linking picker shows preview only after a reviewed selection is saved and posts it in a new tab', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-picker-preview',
        sessionToken: 'deep-linking-token-picker-preview',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: buildAssignmentResources({
      packageVersionId: 3,
      packageVersion: '0.3.0',
    }),
  });
  const app = createApp({ getRepository: () => repository });

  const initialResponse = await app.request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-picker-preview?token=deep-linking-token-picker-preview',
  );

  assertEquals(initialResponse.status, 200);

  const initialBody = await initialResponse.text();

  assertEquals(initialBody.includes('/preview'), false);
  assertEquals(initialBody.includes('target="_blank"'), false);

  const saveForm = new FormData();

  saveForm.set('token', 'deep-linking-token-picker-preview');
  saveForm.set(
    'selection',
    buildDeepLinkingSelectionValue({
      packageVersionId: 3,
      contentPath: '/content/bonus.json',
    }),
  );

  const savedResponse = await app.request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-picker-preview',
    {
      method: 'POST',
      body: saveForm,
    },
  );

  assertEquals(savedResponse.status, 200);

  const savedBody = await savedResponse.text();

  assertStringIncludes(
    savedBody,
    'action="/lti/deep-linking/sessions/deep-linking-session-picker-preview/preview"',
  );
  assertStringIncludes(savedBody, 'target="_blank"');
  assertStringIncludes(savedBody, 'name="token" value="deep-linking-token-picker-preview"');
});

Deno.test('POST /lti/deep-linking/sessions/:id/preview rejects missing saved selections and keeps the Deep Linking session usable', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-preview-blocked',
        sessionToken: 'deep-linking-token-preview-blocked',
        selection: null,
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [buildDeepLinkingResourceOption()],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('token', 'deep-linking-token-preview-blocked');

  const previewResponse = await app.request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-preview-blocked/preview',
    {
      method: 'POST',
      body: formData,
    },
  );

  assertEquals(previewResponse.status, 409);
  assertEquals(previewResponse.headers.get('location'), null);

  const previewBody = await previewResponse.text();

  assertStringIncludes(previewBody, 'Preview blocked');
  assertStringIncludes(previewBody, 'Save one reviewed assignment resource');

  const savedSession = await repository.getDeepLinkingSessionById(
    'deep-linking-session-preview-blocked',
  );

  assertEquals(savedSession?.usedAt, null);

  const submitResponse = await app.request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-preview-blocked/submit',
    {
      method: 'POST',
      body: formData,
    },
  );

  assertEquals(submitResponse.status, 409);
  assertStringIncludes(await submitResponse.text(), 'Return blocked');
});

Deno.test('POST /lti/deep-linking/sessions/:id/preview launches a governed runtime session for the saved reviewed selection', async () => {
  await withRuntimeOriginEnv(async () => {
    await withAuthoringPreviewSnapshot(async (snapshotRoot) => {
      const repository = createInMemoryPackageReviewRepository({
        packageVersions: [
          buildAuthoringPreviewPackageVersion({
            id: 7,
            version: '0.7.0',
            snapshotRoot,
          }),
        ],
        deepLinkingSessions: [
          buildDeepLinkingSessionRecord({
            sessionId: 'deep-linking-session-preview-launch',
            sessionToken: 'deep-linking-token-preview-launch',
            contextId: 'physics-101',
            selection: buildDeepLinkingResourceSelection({
              packageVersionId: 7,
              packageVersion: '0.7.0',
              contentPath: '/content/bonus.json',
              activityId: '/content/bonus.json',
              contentTitle: 'Bonus Activity',
            }),
            expiresAt: '2030-03-25T16:20:00Z',
          }),
        ],
        deepLinkingResourceOptions: buildAssignmentResources({
          packageVersionId: 7,
          packageVersion: '0.7.0',
        }),
      });
      const app = createApp({ getRepository: () => repository });
      const formData = new FormData();

      formData.set('token', 'deep-linking-token-preview-launch');

      const previewResponse = await app.request(
        'https://lantern.example/lti/deep-linking/sessions/deep-linking-session-preview-launch/preview',
        {
          method: 'POST',
          body: formData,
        },
      );

      assertEquals(previewResponse.status, 303);

      const location = previewResponse.headers.get('location') ?? '';

      assertStringIncludes(location, 'https://runtime.lantern.example/runtime/sessions/');
      assertStringIncludes(location, '?token=');

      const runtimeLocation = new URL(location);
      const runtimeSessionId = runtimeLocation.pathname.split('/').at(-1) ?? '';
      const runtimeSession = await repository.getRuntimeSessionById(runtimeSessionId);
      const previewSession = await repository.getLatestPreviewSessionByPackageVersion(
        7,
        'deepLinkingAuthoring',
      );

      assertEquals(runtimeSession?.sessionToken, runtimeLocation.searchParams.get('token'));
      assertEquals(runtimeSession?.launch.userRole, 'instructor');
      assertEquals(runtimeSession?.launch.courseId, 'physics-101');
      assertEquals(runtimeSession?.launch.assignmentId ?? null, null);
      assertEquals(runtimeSession?.launch.activityId, '/content/bonus.json');
      assertEquals(runtimeSession?.contentPath, `${snapshotRoot}/content/bonus.json`);
      assertEquals(previewSession?.origin, 'deepLinkingAuthoring');
      assertEquals(previewSession?.contentPath, '/content/bonus.json');
      assertEquals(previewSession?.deepLinkingSessionId, 'deep-linking-session-preview-launch');

      const contentResponse = await app.request(
        `https://runtime.lantern.example/runtime/sessions/${runtimeSessionId}/content`,
        {
          headers: {
            Authorization: `Bearer ${runtimeSession?.sessionToken ?? ''}`,
          },
        },
      );

      assertEquals(contentResponse.status, 200);

      const content = (await contentResponse.json()) as {
        title: string;
        questions: Array<{ id: string }>;
      };

      assertEquals(content.title, 'Bonus Activity');
      assertEquals(content.questions[0]?.id, 'bonus-q1');
    });
  });
});

Deno.test('POST /lti/deep-linking/sessions/:id/preview does not consume the Deep Linking session or break the later LMS return', async () => {
  await withRuntimeOriginEnv(async () => {
    await withAuthoringPreviewSnapshot(async (snapshotRoot) => {
      const repository = createInMemoryPackageReviewRepository({
        packageVersions: [
          buildAuthoringPreviewPackageVersion({
            id: 8,
            version: '0.8.0',
            snapshotRoot,
          }),
        ],
        deployments: [
          buildDeploymentRecord({
            id: 1,
            enabledPackageVersionId: 8,
            enabledPackageVersion: '0.8.0',
            binding: buildDeploymentBinding(),
          }),
        ],
        deepLinkingSessions: [
          buildDeepLinkingSessionRecord({
            sessionId: 'deep-linking-session-preview-submit',
            sessionToken: 'deep-linking-token-preview-submit',
            selection: buildDeepLinkingResourceSelection({
              packageVersionId: 8,
              packageVersion: '0.8.0',
              contentPath: '/content/bonus.json',
              activityId: '/content/bonus.json',
              contentTitle: 'Bonus Activity',
            }),
            expiresAt: '2030-03-25T16:20:00Z',
          }),
        ],
        deepLinkingResourceOptions: buildAssignmentResources({
          packageVersionId: 8,
          packageVersion: '0.8.0',
        }),
      });
      const app = createApp({ getRepository: () => repository });
      const formData = new FormData();

      formData.set('token', 'deep-linking-token-preview-submit');

      const previewResponse = await app.request(
        'https://lantern.example/lti/deep-linking/sessions/deep-linking-session-preview-submit/preview',
        {
          method: 'POST',
          body: formData,
        },
      );

      assertEquals(previewResponse.status, 303);

      const sessionAfterPreview = await repository.getDeepLinkingSessionById(
        'deep-linking-session-preview-submit',
      );

      assertEquals(sessionAfterPreview?.usedAt, null);
      assertEquals(sessionAfterPreview?.selection?.contentPath, '/content/bonus.json');

      await withCanvasReturnEnv(async () => {
        const submitResponse = await app.request(
          'https://lantern.example/lti/deep-linking/sessions/deep-linking-session-preview-submit/submit',
          {
            method: 'POST',
            body: formData,
          },
        );

        assertEquals(submitResponse.status, 200);

        const body = await submitResponse.text();
        const responseJwt = extractHiddenInputValue(body, 'JWT');
        const verified = await verifyDeepLinkingResponseJwt(responseJwt);
        const contentItems = verified.payload[
          'https://purl.imsglobal.org/spec/lti-dl/claim/content_items'
        ] as Array<Record<string, unknown>>;
        const contentItem = contentItems[0] ?? {};
        const placementId = (contentItem.custom as Record<string, unknown>)[
          LANTERN_PLACEMENT_CUSTOM_KEY
        ] as string;
        const savedPlacement = await repository.getReviewedPlacementById(placementId);
        const sessionAfterSubmit = await repository.getDeepLinkingSessionById(
          'deep-linking-session-preview-submit',
        );

        assertStringIncludes(body, 'Returning assignment resource to LMS');
        assertEquals(savedPlacement?.contentPath, '/content/bonus.json');
        assertEquals(savedPlacement?.activityId, '/content/bonus.json');
        assertEquals(sessionAfterSubmit?.usedAt !== null, true);
      });
    });
  });
});

function buildAssignmentResources(input: { packageVersionId: number; packageVersion: string }) {
  return [
    buildDeepLinkingResourceOption({
      packageVersionId: input.packageVersionId,
      packageVersion: input.packageVersion,
      installScope: 'assignment',
      contentPath: '/content/activity.json',
      activityId: '/content/activity.json',
      contentTitle: 'Default Activity',
    }),
    buildDeepLinkingResourceOption({
      packageVersionId: input.packageVersionId,
      packageVersion: input.packageVersion,
      installScope: 'assignment',
      contentPath: '/content/bonus.json',
      activityId: '/content/bonus.json',
      contentTitle: 'Bonus Activity',
    }),
  ];
}

function buildAuthoringPreviewPackageVersion(input: {
  id: number;
  version: string;
  snapshotRoot: string;
}) {
  return buildPackageVersionRecord({
    id: input.id,
    version: input.version,
    approvalStatus: 'approved',
    reviewedAt: '2026-04-01T12:00:00Z',
    installScope: 'assignment',
    manifestJson: {
      app_id: 'chapter-4-asteroids',
      version: input.version,
      title: 'Chapter 4 Asteroids',
      content_files: ['/content/activity.json', '/content/bonus.json'],
      preview: {
        fixtures_file: '/preview/fixtures.json',
        tests_file: '/preview/tests.json',
      },
    },
    artifact: {
      snapshotRoot: input.snapshotRoot,
      manifestPath: `${input.snapshotRoot}/manifest.json`,
      entrypointPath: `${input.snapshotRoot}/dist/index.html`,
      digest: `sha256:${input.version}-authoring-preview`,
    },
  });
}

async function withAuthoringPreviewSnapshot(
  run: (snapshotRoot: string) => Promise<void>,
): Promise<void> {
  const snapshotRoot = await Deno.makeTempDir({
    prefix: 'lantern-authoring-preview-',
  });

  try {
    await Deno.mkdir(`${snapshotRoot}/content`, { recursive: true });
    await Deno.mkdir(`${snapshotRoot}/dist`, { recursive: true });
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.mkdir(`${snapshotRoot}/scoring`, { recursive: true });

    await Deno.writeTextFile(
      `${snapshotRoot}/manifest.json`,
      JSON.stringify({
        schema_version: '1',
        app_id: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
        owner: {
          type: 'user',
          id: 'instructor_123',
        },
        entrypoint: '/dist/index.html',
        roles: ['learner', 'instructor'],
        install_scope: 'assignment',
        capabilities: [
          'read_launch_context',
          'read_activity_content',
          'submit_attempt_event',
          'finalize_attempt',
          'read_local_state',
          'write_local_state',
        ],
        grading: {
          mode: 'declarative',
          rubric_file: '/scoring/rubric.json',
          max_score: 100,
        },
        content_files: ['/content/activity.json', '/content/bonus.json'],
        preview: {
          fixtures_file: '/preview/fixtures.json',
          tests_file: '/preview/tests.json',
        },
      }),
    );
    await Deno.writeTextFile(
      `${snapshotRoot}/dist/index.html`,
      '<!doctype html><html><body>Authoring Preview</body></html>',
    );
    await Deno.writeTextFile(
      `${snapshotRoot}/content/activity.json`,
      JSON.stringify({
        title: 'Default Activity',
        questions: [{ id: 'q1' }],
      }),
    );
    await Deno.writeTextFile(
      `${snapshotRoot}/content/bonus.json`,
      JSON.stringify({
        title: 'Bonus Activity',
        questions: [{ id: 'bonus-q1' }],
      }),
    );
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'instructor',
          course_id: 'course_demo',
          assignment_id: null,
          activity_id: '/content/activity.json',
        },
        attempt_id: 'preview-attempt-demo',
        local_state: null,
      }),
    );
    await Deno.writeTextFile(`${snapshotRoot}/preview/tests.json`, JSON.stringify([]));
    await Deno.writeTextFile(
      `${snapshotRoot}/scoring/rubric.json`,
      JSON.stringify({
        rubric: [],
      }),
    );

    await run(snapshotRoot);
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
}
