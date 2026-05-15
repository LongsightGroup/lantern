import { assertEquals, assertRejects } from '@std/assert';
import {
  createFakeAppPackageGenerator,
  createFakeRepairingAppPackageGenerator,
  createUnavailableAppPackageGenerator,
} from './package_generator.ts';
import {
  AppPackageGenerationFailedError,
  continueAppPackageGenerationRun,
  runAppPackageGeneration,
  startAppPackageGenerationRun,
} from './service.ts';
import { createTypeScriptAppPackageSourceCompiler } from './typescript_source_compiler.ts';
import type {
  AppGenerationValidationFinding,
  AppPackageGenerationResult,
  AppPackagePreviewer,
} from './types.ts';
import { importPackage } from '../package_review/intake.ts';
import { getDefaultPackageSnapshotStore } from '../package_review/snapshot_store_fs.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';
import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';
import { createInMemoryPackageReviewRepository } from '../test_helpers/package_review.ts';

Deno.test('app writer service creates a durable run and records generated artifacts', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const result = await runAppPackageGeneration({
    repository,
    generator: createFakeAppPackageGenerator(
      buildGenerationResult({
        modelRequestMetadata: [
          {
            provider: 'cloudflare',
            model: '@cf/test/model',
            requestId: 'request-1',
            durationMs: 25,
            responseCharacters: 2048,
          },
        ],
      }),
    ),
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game for 100 words.',
    requestedAppId: 'phonics-match',
    now: createClock([
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:01.000Z',
      '2026-05-14T12:00:02.000Z',
    ]),
  });

  assertEquals(result.run.status, 'validating');
  assertEquals(result.run.selectedStarterId, 'simple-activity');
  assertEquals(result.run.generatedAppId, 'phonics-match');
  assertEquals(result.run.generationNotes, ['Generated from fake app package generator.']);
  assertEquals(result.run.modelRequestMetadata[0]?.requestId, 'request-1');
  assertEquals(result.generation.files[0]?.path, 'manifest.json');

  const persisted = await repository.getAppGenerationRunById('generation-1');

  assertEquals(persisted?.status, 'validating');
  assertEquals(persisted?.selectedContext.referenceAppIds, [
    'chapter-4-asteroids',
    'examples/starters/simple-activity',
  ]);
  assertEquals(persisted?.modelRequestMetadata[0]?.provider, 'cloudflare');

  const generatingEvents = await repository.listAuditEventsByEventType('app_generation.generating');
  const progressEvent = generatingEvents.find(
    (event) => event.detail.modelProgressStage === 'planning_app',
  );

  assertEquals(progressEvent?.summary, 'Planning a phonics activity with simple learner progress.');

  const validationEvents = await repository.listAuditEventsByEventType('app_generation.validating');

  assertEquals(validationEvents.length, 1);
  assertEquals(validationEvents[0]?.detail.generationId, 'generation-1');
  assertEquals(validationEvents[0]?.summary, 'Generated package passed Lantern validation.');
});

Deno.test('app writer service records failed generator runs before rejecting', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createUnavailableAppPackageGenerator('model offline'),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'model offline',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'generation_failed');

  const persisted = await repository.getAppGenerationRunById('generation-1');

  assertEquals(persisted?.status, 'failed');
  assertEquals(persisted?.validationFindings[0]?.message, 'model offline');
});

Deno.test('app writer service can continue a previously started durable run', async () => {
  const repository = createInMemoryPackageReviewRepository();

  await startAppPackageGenerationRun({
    repository,
    generator: createFakeAppPackageGenerator(buildGenerationResult()),
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics flashcard app.',
    now: createClock(['2026-05-14T12:00:00.000Z']),
  });

  const result = await continueAppPackageGenerationRun({
    repository,
    generator: createFakeAppPackageGenerator(buildGenerationResult()),
    generationId: 'generation-1',
    now: createClock(['2026-05-14T12:00:01.000Z', '2026-05-14T12:00:02.000Z']),
  });

  assertEquals(result.run.status, 'validating');
  assertEquals(result.run.selectedStarterId, 'simple-activity');
  assertEquals(result.run.generatedAppId, 'phonics-match');
});

Deno.test('app writer service classifies model request timeouts distinctly', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createUnavailableAppPackageGenerator('3046: Request timeout'),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics flashcard app.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    '3046: Request timeout',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'generation_model_timeout');
  assertEquals(error.run.validationFindings[0]?.detail, {
    providerError: 'timeout',
  });
});

Deno.test('app writer service explains invalid JSON model output clearly', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createUnavailableAppPackageGenerator(
          'App package generator returned invalid JSON.',
        ),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics flashcard app.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'invalid JSON',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'generation_failed');
  assertEquals(error.run.validationFindings[0]?.detail, {
    providerError: 'invalid_json',
  });
  assertEquals(
    error.run.validationFindings[0]?.fix,
    'Retry generation. Lantern rejects model output unless it contains one valid JSON app package object.',
  );
});

Deno.test('app writer service records package validation failures before rejecting', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const invalidPackage = buildGenerationResult({
    files: [
      ...buildValidSimpleActivityFiles(),
      {
        path: 'server/worker.ts',
        contents: 'export default {};\n',
      },
    ],
  });

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createFakeAppPackageGenerator(invalidPackage),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
          '2026-05-14T12:00:03.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'Generated package failed validation.',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(
    error.run.validationFindings.some((finding) => finding.code === 'file_path_not_allowed'),
    true,
  );

  const persisted = await repository.getAppGenerationRunById('generation-1');

  assertEquals(persisted?.status, 'failed');
  assertEquals(
    persisted?.validationFindings.some((finding) => finding.code === 'file_path_not_allowed'),
    true,
  );
});

Deno.test('app writer service repairs a generated package once and persists the successful run', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const invalidPackage = buildGenerationResult({
    files: [
      ...buildValidSimpleActivityFiles(),
      {
        path: 'server/worker.ts',
        contents: 'export default {};\n',
      },
    ],
  });

  const result = await runAppPackageGeneration({
    repository,
    generator: createFakeRepairingAppPackageGenerator(invalidPackage, [buildGenerationResult()]),
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    now: createClock([
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:01.000Z',
      '2026-05-14T12:00:02.000Z',
      '2026-05-14T12:00:03.000Z',
      '2026-05-14T12:00:04.000Z',
    ]),
  });

  assertEquals(result.run.status, 'validating');
  assertEquals(result.run.repairAttemptCount, 1);
  assertEquals(result.run.validationFindings, []);

  const persisted = await repository.getAppGenerationRunById('generation-1');

  assertEquals(persisted?.repairAttemptCount, 1);
  assertEquals(persisted?.validationFindings, []);
});

Deno.test('app writer service compiles TypeScript authoring source before validation', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const result = await runAppPackageGeneration({
    repository,
    generator: createFakeAppPackageGenerator(
      buildGenerationResult({
        files: buildTypeScriptAuthoringPackageFiles(),
      }),
    ),
    sourceCompiler: createTypeScriptAppPackageSourceCompiler(),
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    now: createClock([
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:01.000Z',
      '2026-05-14T12:00:02.000Z',
    ]),
  });

  assertEquals(result.run.status, 'validating');
  assertEquals(
    result.generation.files.some((file) => file.path === 'source/app.ts'),
    false,
  );
  assertEquals(
    result.generation.files
      .find((file) => file.path === 'dist/app.js')
      ?.contents.includes('getActivityContent'),
    true,
  );
  assertEquals(
    result.run.generationNotes.includes(
      'Compiled TypeScript authoring source to reviewed browser JavaScript.',
    ),
    true,
  );
});

Deno.test('app writer service stops after exhausted package repair attempts', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const invalidPackage = buildGenerationResult({
    files: [
      ...buildValidSimpleActivityFiles(),
      {
        path: 'server/worker.ts',
        contents: 'export default {};\n',
      },
    ],
  });

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createFakeRepairingAppPackageGenerator(invalidPackage, [invalidPackage]),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        maxRepairAttempts: 1,
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
          '2026-05-14T12:00:03.000Z',
          '2026-05-14T12:00:04.000Z',
          '2026-05-14T12:00:05.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'Generated package failed validation.',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.repairAttemptCount, 1);
  assertEquals(
    error.run.validationFindings.some((finding) => finding.code === 'file_path_not_allowed'),
    true,
  );
});

Deno.test('app writer service feeds preview failures into the repair loop', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const previewer = createSequencePreviewer([
    [
      {
        code: 'preview_assertion_failed',
        severity: 'error',
        message: 'Selector [data-test="missing"] was not found in the preview DOM.',
        file: '/preview/tests.json',
        field: null,
        fix: 'Update the generated app UI or preview assertion so the reviewed preview passes.',
        detail: {},
      },
    ],
    [],
  ]);

  const result = await runAppPackageGeneration({
    repository,
    generator: createFakeRepairingAppPackageGenerator(buildGenerationResult(), [
      buildGenerationResult({
        notes: ['Repaired preview assertion failure.'],
      }),
    ]),
    previewer,
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    now: createClock([
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:01.000Z',
      '2026-05-14T12:00:02.000Z',
      '2026-05-14T12:00:03.000Z',
      '2026-05-14T12:00:04.000Z',
      '2026-05-14T12:00:05.000Z',
      '2026-05-14T12:00:06.000Z',
      '2026-05-14T12:00:07.000Z',
    ]),
  });

  assertEquals(result.run.status, 'previewing');
  assertEquals(result.run.repairAttemptCount, 1);
  assertEquals(result.run.validationFindings, []);
  assertEquals(result.run.generationNotes, ['Repaired preview assertion failure.']);
});

Deno.test('app writer service refuses to save generated packages without preview', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createFakeAppPackageGenerator(buildGenerationResult()),
        savePackage: {
          importPackageFromSource() {
            throw new Error('Import must not be called without preview.');
          },
        },
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
          '2026-05-14T12:00:03.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'Generated package preview is not configured.',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings.at(-1)?.code, 'preview_not_configured');
});

Deno.test({
  name: 'app writer service saves a previewed generated package as pending review',
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const repository = createInMemoryPackageReviewRepository();
    const storageRoot = await Deno.makeTempDir({
      prefix: 'lantern-generated-package-',
    });

    try {
      const result = await runAppPackageGeneration({
        repository,
        generator: createFakeAppPackageGenerator(buildGenerationResult()),
        previewer: createSequencePreviewer([[]]),
        savePackage: {
          importPackageFromSource: (source, options = {}) =>
            importPackage({
              ...options,
              source,
              snapshotStore: getDefaultPackageSnapshotStore(),
              env: TEST_RUNTIME_CONTRACT_ENV,
            }),
          storageRoot,
        },
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
          '2026-05-14T12:00:03.000Z',
          '2026-05-14T12:00:04.000Z',
        ]),
      });

      assertEquals(result.run.status, 'saved_pending_version');
      assertEquals(result.run.packageVersionId, 1);
      assertEquals(result.packageVersion?.approvalStatus, 'pending');
      assertEquals(
        await Deno.readTextFile(`${storageRoot}/phonics-match/0.1.0/manifest.json`),
        buildValidSimpleActivityFiles()[0]?.contents,
      );
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  },
});

Deno.test('app writer service rejects generated starter drift', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const mismatched = buildGenerationResult({
    selectedStarterId: 'browser-autograder',
  });

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        generator: createFakeAppPackageGenerator(mismatched),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'did not match selected starter',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'starter_mismatch');
});

function buildGenerationResult(
  overrides: Partial<AppPackageGenerationResult> = {},
): AppPackageGenerationResult {
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
        message: 'Planning a phonics activity with simple learner progress.',
      },
    ],
    notes: ['Generated from fake app package generator.'],
    validationFindings: [],
    ...overrides,
  };
}

function buildTypeScriptAuthoringPackageFiles(): AppPackageGenerationResult['files'] {
  return [
    ...buildValidSimpleActivityFiles().filter((file) => file.path !== 'dist/app.js'),
    {
      path: 'source/content_model.ts',
      contents: 'interface ActivityContent {\n  title: string;\n  words: string[];\n}\n',
    },
    {
      path: 'source/app.ts',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern preview injects window.GatewayApp.");\n  const content = await gateway.getActivityContent<ActivityContent>();\n  document.body.dataset.title = content.title;\n  await gateway.emitAttemptEvent({ type: "complete", timestamp: new Date().toISOString() });\n  await gateway.finalizeAttempt({ completionState: "completed" });\n}\nvoid start();\n',
    },
  ];
}

const TEST_RUNTIME_CONTRACT_ENV = {
  get(name: string): string | undefined {
    return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
  },
};

function createSequencePreviewer(results: AppGenerationValidationFinding[][]): AppPackagePreviewer {
  const remainingResults = results.map((result) => structuredClone(result));

  return {
    preview(_input) {
      const nextResult = remainingResults.shift();

      if (nextResult === undefined) {
        throw new Error('Previewer had no queued result.');
      }

      return Promise.resolve(nextResult);
    },
  };
}

function createClock(times: string[]): () => string {
  const remaining = [...times];

  return () => {
    const next = remaining.shift();

    if (!next) {
      throw new Error('Test clock ran out of timestamps.');
    }

    return next;
  };
}
