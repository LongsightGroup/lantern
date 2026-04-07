import { assertEquals, assertRejects } from '@std/assert';
import { getReferencePackageSourceRoot } from '../package_review/intake.ts';
import { getDefaultRuntimeArtifactStore } from '../runtime/artifact_store_fs.ts';
import { buildPackageVersionRecord } from '../test_helpers/package_review.ts';
import { createInMemoryPackageReviewRepository } from '../test_helpers/package_review.ts';
import {
  createPreviewSession,
  launchPreviewRuntimeSession,
  preparePreviewSession,
} from './service.ts';

const artifactStore = getDefaultRuntimeArtifactStore();

Deno.test('preview service loads preview.fixtures_file and validates required fields before preparing launch context', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/fixtures.json');
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'instructor',
          course_id: 'course-preview-42',
          assignment_id: 'assignment-preview-7',
          activity_id: 'activity-preview-9',
        },
        attempt_id: 'attempt-preview-123',
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 11,
      approvalStatus: 'approved',
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-fixture-test',
      },
      manifestJson: {
        app_id: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
      },
    });

    const prepared = await preparePreviewSession({
      packageVersion: approvedPackage,
      artifactStore,
      now: () => new Date('2026-03-25T02:00:00Z'),
      createOpaqueToken: () => 'opaque-1',
    });

    assertEquals(prepared.launch.userRole, 'instructor');
    assertEquals(prepared.launch.courseId, 'course-preview-42');
    assertEquals(prepared.launch.assignmentId, 'assignment-preview-7');
    assertEquals(prepared.launch.activityId, 'activity-preview-9');
    assertEquals(prepared.fixtureData.attempt_id, 'attempt-preview-123');
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview service fails clearly when preview fixtures are missing and does not fall back to runtime defaults', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/missing.json');
    const approvedPackage = buildPackageVersionRecord({
      id: 12,
      approvalStatus: 'approved',
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-missing-fixture',
      },
      manifestJson: {
        preview: {
          fixtures_file: '/preview/missing.json',
          tests_file: '/preview/tests.json',
        },
      },
    });

    await assertRejects(
      () =>
        preparePreviewSession({
          packageVersion: approvedPackage,
          artifactStore,
          now: () => new Date('2026-03-25T02:05:00Z'),
          createOpaqueToken: () => 'opaque-1',
        }),
      Error,
      'Saved test launch file /preview/missing.json is missing from the reviewed app files.',
    );
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview service applies explicit test-launch overrides over saved defaults', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/fixtures.json');
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'learner',
          course_id: 'course-preview-42',
          assignment_id: 'assignment-preview-7',
          activity_id: 'activity-preview-9',
        },
        attempt_id: 'attempt-preview-123',
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 14,
      approvalStatus: 'approved',
      roles: ['learner', 'instructor'],
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-launch-overrides',
      },
    });

    const prepared = await preparePreviewSession({
      packageVersion: approvedPackage,
      artifactStore,
      launch: {
        userRole: 'instructor',
        courseId: 'physics-201',
        assignmentId: null,
        activityId: 'boss-fight',
      },
      now: () => new Date('2026-03-25T02:07:00Z'),
      createOpaqueToken: () => 'opaque-2',
    });

    assertEquals(prepared.launch.userRole, 'instructor');
    assertEquals(prepared.launch.courseId, 'physics-201');
    assertEquals(prepared.launch.assignmentId, null);
    assertEquals(prepared.launch.activityId, 'boss-fight');
    assertEquals(prepared.fixtureData.launch.user_role, 'learner');
    assertEquals(prepared.fixtureData.launch.course_id, 'course-preview-42');
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview service returns fake identity/session defaults shaped for runtime bootstrap and evidence capture', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/fixtures.json');
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'learner',
          course_id: 'course-preview-42',
          assignment_id: null,
          activity_id: 'activity-preview-9',
        },
        attempt_id: 'attempt-preview-456',
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 13,
      approvalStatus: 'approved',
      grading: {
        mode: 'declarative',
        rubricFile: '/scoring/rubric.json',
        maxScore: 80,
      },
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-runtime-shape',
      },
      manifestJson: {
        app_id: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
      },
    });
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [approvedPackage],
    });
    const tokens = ['opaque-a', 'opaque-b'];
    let index = 0;
    const created = await createPreviewSession({
      repository,
      packageVersion: approvedPackage,
      artifactStore,
      now: () => new Date('2026-03-25T02:10:00Z'),
      createOpaqueToken: () => {
        const token = tokens[index] ?? 'opaque-fallback';
        index += 1;
        return token;
      },
    });

    assertEquals(created.previewSession.sessionId, 'preview-session-opaque-a');
    assertEquals(created.previewSession.launch.userId, 'preview-user-opaque-b');
    assertEquals(created.previewSession.fakeAttemptId, 'attempt-preview-456');
    assertEquals(created.fakeScoring.scoreGiven, 0);
    assertEquals(created.fakeScoring.scoreMaximum, 80);
    assertEquals(created.fakeScoring.activityProgress, 'Completed');
    assertEquals(created.fakeScoring.gradingProgress, 'FullyGraded');
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview service defaults admin launches to admin origin and canonical preview content', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/fixtures.json');
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'instructor',
          course_id: 'course-preview-42',
          assignment_id: null,
          activity_id: 'activity-preview-9',
        },
        attempt_id: 'attempt-preview-789',
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 15,
      approvalStatus: 'approved',
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-default-origin',
      },
      manifestJson: {
        app_id: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
        content_files: ['/content/activity.json', '/content/bonus.json'],
      },
    });

    const prepared = await preparePreviewSession({
      packageVersion: approvedPackage,
      artifactStore,
      now: () => new Date('2026-04-01T10:00:00Z'),
      createOpaqueToken: () => 'opaque-admin',
    });

    assertEquals(prepared.origin, 'adminTestLaunch');
    assertEquals(prepared.contentPath, '/content/activity.json');
    assertEquals(prepared.deepLinkingSessionId, null);
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview service keeps explicit authoring origin and selected content in the runtime session', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/fixtures.json');
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'learner',
          course_id: 'course-preview-42',
          assignment_id: null,
          activity_id: 'activity-preview-9',
        },
        attempt_id: 'attempt-preview-900',
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 16,
      approvalStatus: 'approved',
      roles: ['learner', 'instructor'],
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-authoring-origin',
      },
      manifestJson: {
        app_id: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
        content_files: ['/content/activity.json', '/content/bonus.json'],
      },
    });
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [approvedPackage],
    });
    const tokens = ['opaque-a', 'opaque-b', 'opaque-c', 'opaque-d'];
    let index = 0;
    const launched = await launchPreviewRuntimeSession({
      repository,
      packageVersion: approvedPackage,
      artifactStore,
      launch: {
        userRole: 'instructor',
        courseId: 'physics-201',
        assignmentId: null,
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
      },
      previewOrigin: 'deepLinkingAuthoring',
      deepLinkingSessionId: 'deep-linking-session-42',
      now: () => new Date('2026-04-01T10:05:00Z'),
      createOpaqueToken: () => {
        const token = tokens[index] ?? 'opaque-fallback';
        index += 1;
        return token;
      },
    });

    assertEquals(launched.previewSession.origin, 'deepLinkingAuthoring');
    assertEquals(launched.previewSession.contentPath, '/content/bonus.json');
    assertEquals(launched.previewSession.deepLinkingSessionId, 'deep-linking-session-42');
    assertEquals(launched.runtimeSession.contentPath, `${snapshotRoot}/content/bonus.json`);
    assertEquals(launched.runtimeSession.launch.activityId, '/content/bonus.json');
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview runtime sessions from admin and authoring origins both keep live LMS services disabled', async () => {
  const snapshotRoot = await Deno.makeTempDir({ prefix: 'lantern-preview-' });

  try {
    await writePreviewManifest(snapshotRoot, '/preview/fixtures.json');
    await Deno.mkdir(`${snapshotRoot}/preview`, { recursive: true });
    await Deno.writeTextFile(
      `${snapshotRoot}/preview/fixtures.json`,
      JSON.stringify({
        launch: {
          user_role: 'instructor',
          course_id: 'course-preview-42',
          assignment_id: null,
          activity_id: 'activity-preview-9',
        },
        attempt_id: 'attempt-preview-901',
        local_state: null,
      }),
    );

    const approvedPackage = buildPackageVersionRecord({
      id: 17,
      approvalStatus: 'approved',
      roles: ['learner', 'instructor'],
      artifact: {
        snapshotRoot,
        manifestPath: `${snapshotRoot}/manifest.json`,
        entrypointPath: `${snapshotRoot}/dist/index.html`,
        digest: 'sha256:preview-services-null',
      },
      manifestJson: {
        app_id: 'chapter-4-asteroids',
        version: '0.1.0',
        title: 'Chapter 4 Asteroids',
        content_files: ['/content/activity.json', '/content/bonus.json'],
      },
    });
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [approvedPackage],
    });

    const adminLaunch = await launchPreviewRuntimeSession({
      repository,
      packageVersion: approvedPackage,
      artifactStore,
      now: () => new Date('2026-04-01T10:07:00Z'),
      createOpaqueToken: () => crypto.randomUUID(),
    });
    const authoringLaunch = await launchPreviewRuntimeSession({
      repository,
      packageVersion: approvedPackage,
      artifactStore,
      launch: {
        userRole: 'instructor',
        courseId: 'physics-202',
        assignmentId: null,
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
      },
      previewOrigin: 'deepLinkingAuthoring',
      deepLinkingSessionId: 'deep-linking-session-84',
      now: () => new Date('2026-04-01T10:08:00Z'),
      createOpaqueToken: () => crypto.randomUUID(),
    });

    assertEquals(adminLaunch.runtimeSession.services.ags, null);
    assertEquals(adminLaunch.runtimeSession.services.nrps, null);
    assertEquals(authoringLaunch.runtimeSession.services.ags, null);
    assertEquals(authoringLaunch.runtimeSession.services.nrps, null);
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('preview service reads committed quick-study fixtures without inventing a second preview path', async () => {
  const snapshotRoot = getReferencePackageSourceRoot('quick-study');
  const approvedPackage = buildPackageVersionRecord({
    id: 18,
    appId: 'quick-study',
    version: '0.1.0',
    title: 'Quick Study',
    description:
      'A calm flashcard deck that turns short review sessions into a streak-driven study ritual.',
    approvalStatus: 'approved',
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
      content_files: ['/content/activity.json'],
    },
    artifact: {
      snapshotRoot,
      manifestPath: `${snapshotRoot}/manifest.json`,
      entrypointPath: `${snapshotRoot}/dist/index.html`,
      digest: 'sha256:quick-study-preview-fixtures',
    },
  });

  const prepared = await preparePreviewSession({
    packageVersion: approvedPackage,
    artifactStore,
    now: () => new Date('2026-04-05T14:00:00Z'),
    createOpaqueToken: () => 'quick-study-preview',
  });

  assertEquals(prepared.appId, 'quick-study');
  assertEquals(prepared.contentPath, '/content/activity.json');
  assertEquals(prepared.launch.courseId, 'course_demo');
  assertEquals(prepared.launch.activityId, 'quick-study');
  assertEquals(prepared.fixtureData.attempt_id, 'attempt_demo_2');
});

async function writePreviewManifest(snapshotRoot: string, fixturesFile: string): Promise<void> {
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
      install_scope: 'course',
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
      content_files: ['/content/activity.json'],
      preview: {
        fixtures_file: fixturesFile,
        tests_file: '/preview/tests.json',
      },
    }),
  );
}
