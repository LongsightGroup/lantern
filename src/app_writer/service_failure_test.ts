import { assertEquals, assertRejects } from '@std/assert';
import {
  createStaticAppWriterWorkspaceRunner,
  createUnavailableAppWriterWorkspaceRunner,
} from '../test_helpers/app_writer_workspace_runner.ts';
import {
  AppPackageGenerationFailedError,
  continueAppPackageGenerationRun,
  runAppPackageGeneration,
  startAppPackageGenerationRun,
} from './service.ts';
import type { AppWriterWorkspaceRunner } from './workspace_runner.ts';
import { AppWriterWorkspaceHarnessError } from './workspace_runner.ts';
import { createInMemoryPackageReviewRepository } from '../test_helpers/package_review.ts';
import {
  buildGenerationResult,
  createClock,
  createStagedAppWriterWorkspaceRunner,
} from './service_test_support.ts';

Deno.test('app writer service records authoring provider capacity failures on the plan', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const stagedWorkspaceRunner = createStagedAppWriterWorkspaceRunner();
  const workspaceRunner: AppWriterWorkspaceRunner = {
    ...stagedWorkspaceRunner,
    author(_input) {
      return Promise.reject(new Error('3040: Capacity temporarily exceeded, please try again.'));
    },
  };

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner,
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
        ]),
      }),
    AppPackageGenerationFailedError,
    '3040: Capacity temporarily exceeded',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'generation_model_capacity_exceeded');
  assertEquals(error.run.validationFindings[0]?.detail, {
    providerError: 'capacity_exceeded',
  });

  const workspace = await repository.getAppGenerationWorkspaceByGenerationId('generation-1');
  const authorStep = workspace?.generationPlan.find((step) => step.id === 'author_workspace');

  assertEquals(authorStep?.status, 'failed');
  assertEquals(workspace?.validationFindings, error.run.validationFindings);
});

Deno.test('app writer service persists harness model metadata on failed authoring runs', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const stagedWorkspaceRunner = createStagedAppWriterWorkspaceRunner();
  const workspaceRunner: AppWriterWorkspaceRunner = {
    ...stagedWorkspaceRunner,
    author(_input) {
      return Promise.reject(
        new AppWriterWorkspaceHarnessError({
          code: 'code_execution_failed',
          message: 'Workspace edit code failed.',
          modelRequestMetadata: [
            {
              provider: 'cloudflare',
              model: '@cf/test/model',
              requestId: null,
              durationMs: 80,
              responseCharacters: 2048,
              stage: 'author',
              attempt: 1,
              outcome: 'failed',
              errorCode: 'code_execution_failed',
            },
          ],
          notes: ['Harness failure 1: code_execution_failed'],
        }),
      );
    },
  };

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner,
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
        ]),
      }),
    AppPackageGenerationFailedError,
    'Workspace edit code failed.',
  );

  const failedMetadata = error.run.modelRequestMetadata.at(-1);

  assertEquals(failedMetadata?.stage, 'author');
  assertEquals(failedMetadata?.outcome, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'generation_code_execution_failed');
  assertEquals(
    error.run.generationNotes.includes('Harness failure 1: code_execution_failed'),
    true,
  );
});

Deno.test('app writer service records failed workspaceRunner runs before rejecting', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner: createUnavailableAppWriterWorkspaceRunner('model offline'),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        maxRepairAttempts: 0,
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
    workspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult()),
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics flashcard app.',
    now: createClock(['2026-05-14T12:00:00.000Z']),
  });

  const result = await continueAppPackageGenerationRun({
    repository,
    workspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult()),
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
        workspaceRunner: createUnavailableAppWriterWorkspaceRunner('3046: Request timeout'),
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

Deno.test('app writer service explains invalid workspace harness JSON clearly', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner: createUnavailableAppWriterWorkspaceRunner(
          'App writer workspace harness returned invalid JSON.',
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
    providerError: 'workspace_harness_contract',
  });
  assertEquals(
    error.run.validationFindings[0]?.fix,
    'Retry generation. Lantern rejects workspace harness responses unless they match the current stage contract.',
  );
});

Deno.test('app writer service explains invalid workspace harness shape clearly', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner: createUnavailableAppWriterWorkspaceRunner(
          'normalizedRequest must be a JSON object.',
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
    'normalizedRequest',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(error.run.validationFindings[0]?.code, 'generation_failed');
  assertEquals(error.run.validationFindings[0]?.detail, {
    providerError: 'workspace_harness_contract',
  });
  assertEquals(
    error.run.validationFindings[0]?.fix,
    'Retry generation. Lantern rejects workspace harness responses unless they match the current stage contract.',
  );
});
