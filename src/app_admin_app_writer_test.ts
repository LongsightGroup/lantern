import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import type { AppPackageGenerationResult } from './app_writer/types.ts';
import { buildValidSimpleActivityFiles } from './test_helpers/app_writer_generated_package.ts';
import {
  createStaticAppWriterWorkspaceRunner,
  createUnavailableAppWriterWorkspaceRunner,
} from './test_helpers/app_writer_workspace_runner.ts';
import {
  buildAppGenerationRunRecord,
  buildAppGenerationWorkspaceRecord,
} from './test_helpers/package_review_in_memory_app_generation.ts';
import {
  buildAdminPreviewSessionRecord,
  buildImportedPackageVersion,
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildReviewedPlacementRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('GET /admin/app-writer renders the app writer prompt form', async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/admin/app-writer');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Create app with AI');
  assertStringIncludes(body, 'name="promptText"');
  assertStringIncludes(body, 'name="audience"');
  assertStringIncludes(body, 'name="contentSummary"');
  assertStringIncludes(body, 'name="gradingMode"');
  assertStringIncludes(body, 'data-app-writer-form');
  assertStringIncludes(body, 'data-app-writer-submit');
  assertStringIncludes(body, 'aria-live="polite"');
  assertStringIncludes(body, 'Generating app. Lantern is calling the model');
});

Deno.test('POST /admin/app-writer runs generation and redirects to the run detail page', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const backgroundTasks: Promise<void>[] = [];
  const generationControl: { complete: (() => void) | null } = {
    complete: null,
  };
  const formData = new FormData();
  formData.set('promptText', 'Create a phonics matching game for first grade.');
  formData.set('audience', 'Grade 1 readers');
  formData.set('contentSummary', 'One hundred CVC and blend words.');
  formData.set('gradingMode', 'completion');
  formData.set('requestedAppId', 'phonics-match');

  const app = createApp({
    getRepository: () => repository,
    appWriterWorkspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult(), {
      authorDelay() {
        return new Promise<void>((resolve) => {
          generationControl.complete = resolve;
        });
      },
    }),
    appPackagePreviewer: {
      preview(_input) {
        return Promise.resolve({
          validationFindings: [],
          assertionCount: 1,
          passedAssertionCount: 1,
          runtimeLog: [],
          summary: 'Passed 1/1 preview assertions.',
        });
      },
    },
    importPackageFromSource(_source) {
      return Promise.resolve(
        buildImportedPackageVersion({
          appId: 'phonics-match',
          version: '0.1.0',
          title: 'Phonics Match',
          owner: {
            type: 'user',
            id: 'instructor-1',
          },
          manifestJson: JSON.parse(buildValidSimpleActivityFiles()[0]?.contents ?? '{}') as Record<
            string,
            unknown
          >,
          capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
          grading: {
            mode: 'completion',
            rubricFile: null,
            maxScore: 100,
          },
        }),
      );
    },
  });

  const response = await app.fetch(
    new Request('https://lantern.example/admin/app-writer', {
      method: 'POST',
      headers: { Origin: 'https://lantern.example' },
      body: formData,
    }),
    undefined,
    {
      waitUntil(promise) {
        backgroundTasks.push(promise.then(() => {}));
      },
      passThroughOnException() {},
      props: {},
    },
  );

  assertEquals(response.status, 303);
  const location = response.headers.get('location') ?? '';
  assertStringIncludes(location, '/admin/app-writer/runs/generation-');
  assertEquals(backgroundTasks.length, 1);

  const runningDetailResponse = await app.request(new URL(location, 'https://lantern.example'));
  const runningDetailBody = await runningDetailResponse.text();

  assertEquals(runningDetailResponse.status, 200);
  assertStringIncludes(runningDetailBody, 'Lantern is still working.');
  assertStringIncludes(runningDetailBody, 'window.setTimeout');
  assertStringIncludes(runningDetailBody, 'Generation progress');
  assertStringIncludes(runningDetailBody, 'data-app-writer-live-progress');
  assertStringIncludes(runningDetailBody, 'data-app-writer-live-step');

  await waitForGenerationToStart(() => generationControl.complete);
  const completeGeneration = generationControl.complete;
  if (completeGeneration === null) {
    throw new Error('App writer background generation did not expose a completion hook.');
  }
  completeGeneration();
  await Promise.all(backgroundTasks);

  const detailResponse = await app.request(new URL(location, 'https://lantern.example'));
  const detailBody = await detailResponse.text();

  assertEquals(detailResponse.status, 200);
  assertStringIncludes(detailBody, 'saved pending version');
  assertStringIncludes(detailBody, 'Open pending version');
  assertStringIncludes(detailBody, 'Generation request details');
  assertStringIncludes(detailBody, 'Recipe lantern-learning-app-writer@0.1.0');
  assertStringIncludes(detailBody, 'Grade 1 readers');
  assertStringIncludes(detailBody, 'Generated files');
  assertStringIncludes(detailBody, 'Test pending version');
  assertStringIncludes(detailBody, 'Started an app writer generation run.');
  assertStringIncludes(detailBody, 'Planning a phonics game with student progress reporting.');
  assertStringIncludes(detailBody, 'planning app');
  assertStringIncludes(detailBody, 'Preview summary');
  assertStringIncludes(detailBody, 'Generation preview completed: Passed 1/1 preview assertions.');

  await repository.createReviewedPlacement(
    buildReviewedPlacementRecord({
      placementId: 'generated-placement-1',
      deploymentSlug: 'phonics-match-canvas',
      appId: 'phonics-match',
      packageVersionId: 1,
      packageVersion: '0.1.0',
      packageTitle: 'Phonics Match',
      contextTitle: 'Reading 101',
      resourceLinkId: 'resource-link-generated',
    }),
  );

  const packageResponse = await app.request(
    'https://lantern.example/admin/packages/phonics-match/versions/0.1.0',
  );
  const packageBody = await packageResponse.text();

  assertEquals(packageResponse.status, 200);
  assertStringIncludes(packageBody, 'Generated package activity');
  assertStringIncludes(packageBody, 'Saved generated package as a pending package version.');
  assertStringIncludes(packageBody, 'LMS placements using this version');
  assertStringIncludes(packageBody, 'generated-placement-1');
  assertStringIncludes(packageBody, 'resource-link-generated');
});

Deno.test('POST /admin/app-writer redirects even without a Worker execution context', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const formData = new FormData();
  formData.set('promptText', 'Create a phonics flashcard app.');

  const app = createApp({
    getRepository: () => repository,
    appWriterWorkspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult(), {
      authorDelay() {
        return new Promise<void>(() => {});
      },
    }),
  });

  const response = await app.request('https://lantern.example/admin/app-writer', {
    method: 'POST',
    headers: { Origin: 'https://lantern.example' },
    body: formData,
  });

  assertEquals(response.status, 303);
  const location = response.headers.get('location') ?? '';
  assertStringIncludes(location, '/admin/app-writer/runs/generation-');

  const detailResponse = await app.request(new URL(location, 'https://lantern.example'));
  const detailBody = await detailResponse.text();

  assertEquals(detailResponse.status, 200);
  assertStringIncludes(detailBody, 'Lantern is still working.');
});

Deno.test('POST /admin/app-writer queues a Workflow when the scheduler is configured', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const scheduledGenerationIds: string[] = [];
  const observedAgentSessions: Array<{ generationId: string; workflowInstanceId: string | null }> =
    [];
  let workspaceRunnerCallCount = 0;
  const formData = new FormData();
  formData.set('promptText', 'Create a phonics flashcard app.');

  const app = createApp({
    getRepository: () => repository,
    appWriterWorkspaceRunner: {
      ...createUnavailableAppWriterWorkspaceRunner(
        'Workflow-scheduled generation must not run in the request thread.',
      ),
      initialize(_input) {
        workspaceRunnerCallCount += 1;
        throw new Error('Workflow-scheduled generation must not run in the request thread.');
      },
    },
    appGenerationRunScheduler: {
      schedule(input) {
        scheduledGenerationIds.push(input.generationId);

        return Promise.resolve({
          mode: 'workflow',
          workflowInstanceId: 'workflow-1',
        });
      },
    },
    appWriterAgentSessions: {
      observe(input) {
        observedAgentSessions.push({
          generationId: input.generationId,
          workflowInstanceId: input.workflowInstanceId,
        });

        return Promise.resolve();
      },
      fetchState(_generationId) {
        throw new Error('State should not be fetched in this test.');
      },
      fetchEvents(_generationId, _request) {
        throw new Error('Events should not be fetched in this test.');
      },
    },
  });

  const response = await app.request('https://lantern.example/admin/app-writer', {
    method: 'POST',
    headers: { Origin: 'https://lantern.example' },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertEquals(workspaceRunnerCallCount, 0);
  assertEquals(scheduledGenerationIds.length, 1);
  assertEquals(observedAgentSessions, [
    {
      generationId: scheduledGenerationIds[0] ?? '',
      workflowInstanceId: 'workflow-1',
    },
  ]);
  const location = response.headers.get('location') ?? '';
  assertStringIncludes(location, `/admin/app-writer/runs/${scheduledGenerationIds[0]}`);

  const run = await repository.getAppGenerationRunById(scheduledGenerationIds[0] ?? '');

  assertEquals(run?.status, 'started');

  const detailResponse = await app.request(new URL(location, 'https://lantern.example'));
  const detailBody = await detailResponse.text();

  assertEquals(detailResponse.status, 200);
  assertStringIncludes(detailBody, 'Queued app writer generation in Cloudflare Workflow.');

  const events = await repository.listAuditEventsByEventType('app_generation.generating');

  assertEquals(events.at(-1)?.detail.backgroundRunner, 'workflow');
  assertEquals(events.at(-1)?.detail.workflowInstanceId, 'workflow-1');
});

Deno.test('GET /admin/app-writer/runs/:generationId shows captured workspace before package save', async () => {
  const repository = createInMemoryPackageReviewRepository({
    appGenerationRuns: [
      buildAppGenerationRunRecord({
        status: 'failed',
        validationFindings: [
          {
            code: 'manifest_plan_mismatch',
            severity: 'error',
            message: 'Generated manifest did not match the approved plan.',
            file: 'manifest.json',
            field: '/app_id',
            fix: 'Make manifest.json match the app plan.',
            detail: {},
          },
        ],
      }),
    ],
    appGenerationWorkspaces: [
      buildAppGenerationWorkspaceRecord({
        files: buildValidSimpleActivityFiles(),
        validationFindings: [
          {
            code: 'manifest_plan_mismatch',
            severity: 'error',
            message: 'Generated manifest did not match the approved plan.',
            file: 'manifest.json',
            field: '/app_id',
            fix: 'Make manifest.json match the app plan.',
            detail: {},
          },
        ],
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('https://lantern.example/admin/app-writer/runs/generation-1');
  const body = await response.text();

  assertEquals(response.status, 200);
  assertStringIncludes(body, 'Generated files');
  assertStringIncludes(body, 'manifest.json');
  assertStringIncludes(body, 'dist/app.js');
  assertStringIncludes(body, 'validation or preview findings currently attached');
  assertStringIncludes(body, 'No immutable package version has been saved yet.');
});

Deno.test('GET /admin/app-writer/runs/:generationId/events streams through the app writer Agent session', async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
    appWriterAgentSessions: {
      observe(_input) {
        throw new Error('Observe should not run in this test.');
      },
      fetchState(_generationId) {
        throw new Error('State should not run in this test.');
      },
      fetchEvents(generationId, _request) {
        return Promise.resolve(
          new Response(`event: snapshot\ndata: {"generationId":"${generationId}"}\n\n`, {
            headers: {
              'content-type': 'text/event-stream',
            },
          }),
        );
      },
    },
  }).request('https://lantern.example/admin/app-writer/runs/generation-1/events');
  const body = await response.text();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'text/event-stream');
  assertStringIncludes(body, '"generationId":"generation-1"');
});

Deno.test('GET /admin/app-writer/runs/:generationId shows generated package runtime log', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 7,
        appId: 'phonics-match',
        version: '0.1.0',
        title: 'Phonics Match',
        approvalStatus: 'approved',
      }),
    ],
    appGenerationRuns: [
      buildAppGenerationRunRecord({
        status: 'saved_pending_version',
        generatedAppId: 'phonics-match',
        generatedVersion: '0.1.0',
        packageVersionId: 7,
      }),
    ],
    previewSessions: [
      buildAdminPreviewSessionRecord({
        sessionId: 'preview-generated-1',
        packageVersionId: 7,
        appId: 'phonics-match',
        packageVersion: '0.1.0',
        packageTitle: 'Phonics Match',
        launch: {
          userId: 'preview-user-123',
          userRole: 'learner',
          courseId: 'reading-101',
          assignmentId: 'phonics-week-1',
          activityId: 'phonics-match',
        },
      }),
    ],
    previewEvidence: [
      buildPreviewEvidenceRecord({
        previewSessionId: 'preview-generated-1',
        eventType: 'preview.attempt_event',
        capability: 'submit_attempt_event',
        summary: 'Recorded a phonics card answer in the preview runtime.',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('https://lantern.example/admin/app-writer/runs/generation-1');
  const body = await response.text();

  assertEquals(response.status, 200);
  assertStringIncludes(body, 'Runtime log');
  assertStringIncludes(body, 'preview-generated-1');
  assertStringIncludes(body, 'preview.attempt_event');
  assertStringIncludes(body, 'submit_attempt_event');
  assertStringIncludes(body, 'Recorded a phonics card answer in the preview runtime.');
  assertStringIncludes(body, 'Open full test launch log');
});

async function waitForGenerationToStart(readResolver: () => (() => void) | null): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (readResolver() !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error('App writer background generation did not start.');
}

function buildGenerationResult(): AppPackageGenerationResult {
  return {
    normalizedRequest: {
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      contentSummary: 'One hundred phonics words.',
      requestedActivity: 'matching game',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'phonics-match',
      title: 'Phonics Match',
      description: 'A small matching game for phonics practice.',
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      activityType: 'matching',
      learnerFlow: ['Read the sound.', 'Pick the matching word.', 'Complete all cards.'],
      contentModel: {
        wordCount: 100,
      },
      capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        maxScore: 100,
        scoringSummary: 'Completion credit after all cards are answered.',
      },
      attemptEvents: [
        {
          when: 'after each answer',
          eventType: 'answer',
          questionIdPattern: 'word-*',
        },
      ],
      previewTests: ['renders the title'],
      accessibilityNotes: ['Use buttons for answer choices.'],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Planning a phonics game with student progress reporting.',
      },
    ],
    notes: ['Generated from fake app writer workspace harness.'],
    validationFindings: [],
  };
}
