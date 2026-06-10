import { assertEquals } from '@std/assert';
import { createStaticAppWriterWorkspaceRunner } from '../test_helpers/app_writer_workspace_runner.ts';
import {
  finishGeneratedAppPackageRun,
  generateAppPackageFilesForPlannedRun,
  planAppPackageGenerationRun,
  runAppPackageGeneration,
  startAppPackageGenerationRun,
} from './service.ts';
import { APP_WRITER_RECIPE_ID, APP_WRITER_RECIPE_VERSION } from './recipe.ts';
import { createInMemoryPackageReviewRepository } from '../test_helpers/package_review.ts';
import {
  buildGenerationResult,
  createClock,
  createStagedAppWriterWorkspaceRunner,
} from './service_test_support.ts';

Deno.test('app writer service creates a durable run and records generated artifacts', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const result = await runAppPackageGeneration({
    repository,
    workspaceRunner: createStaticAppWriterWorkspaceRunner(
      buildGenerationResult({
        modelRequestMetadata: [
          {
            provider: 'cloudflare',
            model: '@cf/test/model',
            requestId: 'request-1',
            durationMs: 25,
            responseCharacters: 2048,
            stage: 'author',
            attempt: 1,
            outcome: 'succeeded',
            errorCode: null,
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
  assertEquals(result.run.generationNotes, ['Generated from fake app writer workspace harness.']);
  assertEquals(result.run.modelRequestMetadata[0]?.requestId, 'request-1');
  assertEquals(result.generation.files[0]?.path, 'manifest.json');

  const persisted = await repository.getAppGenerationRunById('generation-1');

  assertEquals(persisted?.status, 'validating');
  assertEquals(persisted?.selectedContext.referenceAppIds, [
    'chapter-4-asteroids',
    'examples/starters/simple-activity',
  ]);
  const persistedRecipe = persisted?.selectedContext.recipe as
    | { recipeId?: unknown; recipeVersion?: unknown }
    | undefined;

  assertEquals(persistedRecipe?.recipeId, APP_WRITER_RECIPE_ID);
  assertEquals(persistedRecipe?.recipeVersion, APP_WRITER_RECIPE_VERSION);
  assertEquals(persisted?.modelRequestMetadata[0]?.provider, 'cloudflare');

  const planningEvents = await repository.listAuditEventsByEventType('app_generation.planning');
  const progressEvent = planningEvents.find(
    (event) => event.detail.modelProgressStage === 'planning_app',
  );

  assertEquals(progressEvent?.summary, 'Planning a phonics activity with simple learner progress.');

  const validationEvents = await repository.listAuditEventsByEventType('app_generation.validating');

  assertEquals(validationEvents.length, 1);
  assertEquals(validationEvents[0]?.detail.generationId, 'generation-1');
  assertEquals(validationEvents[0]?.summary, 'Generated package passed Lantern validation.');
});

Deno.test('app writer service records staged planning before scaffold file generation', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const result = await runAppPackageGeneration({
    repository,
    workspaceRunner: createStagedAppWriterWorkspaceRunner(),
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game for 100 words.',
    requestedAppId: 'phonics-match',
    now: createClock([
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:01.000Z',
      '2026-05-14T12:00:02.000Z',
      '2026-05-14T12:00:03.000Z',
      '2026-05-14T12:00:04.000Z',
    ]),
  });

  assertEquals(result.run.status, 'validating');
  assertEquals(
    result.run.modelRequestMetadata.map((metadata) => metadata.requestId),
    ['request-plan', 'request-files'],
  );
  assertEquals(result.run.generationNotes, [
    'Planned from staged workspace harness.',
    'Wrote files.',
  ]);

  const planningEvents = await repository.listAuditEventsByEventType('app_generation.planning');
  const generatingEvents = await repository.listAuditEventsByEventType('app_generation.generating');

  assertEquals(
    planningEvents.map((event) => event.summary),
    [
      'Created the Lantern-owned app plan for the initialized workspace.',
      'Planning the Lantern app before editing scaffold files.',
    ],
  );
  assertEquals(
    generatingEvents.map((event) => event.summary),
    [
      'Asked the app writer workspace harness to author the scaffold workspace.',
      'Editing the Lantern starter workspace.',
    ],
  );
});

Deno.test('app writer service supports explicit Workflow generation stages', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const workspaceRunner = createStagedAppWriterWorkspaceRunner();

  await startAppPackageGenerationRun({
    repository,
    workspaceRunner,
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game for 100 words.',
    requestedAppId: 'phonics-match',
    now: createClock(['2026-05-14T12:00:00.000Z']),
  });

  const planned = await planAppPackageGenerationRun({
    repository,
    workspaceRunner,
    generationId: 'generation-1',
    now: createClock(['2026-05-14T12:00:01.000Z', '2026-05-14T12:00:02.000Z']),
  });
  const generated = await generateAppPackageFilesForPlannedRun({
    repository,
    workspaceRunner,
    planned,
    now: createClock(['2026-05-14T12:00:03.000Z']),
  });
  const workspaceAfterFiles = await repository.getAppGenerationWorkspaceByGenerationId(
    'generation-1',
  );
  const result = await finishGeneratedAppPackageRun({
    repository,
    workspaceRunner,
    generated,
    now: createClock(['2026-05-14T12:00:04.000Z']),
  });
  const workspaceAfterFinish = await repository.getAppGenerationWorkspaceByGenerationId(
    'generation-1',
  );

  assertEquals(planned.run.status, 'planning');
  assertEquals(generated.run.status, 'generating_package');
  assertEquals(result.run.status, 'validating');
  assertEquals(
    workspaceAfterFiles?.files.some(
      (file) => file.path === 'manifest.json' && file.role === 'package',
    ),
    true,
  );
  assertEquals(
    workspaceAfterFiles?.files.some(
      (file) => file.path === 'AGENTS.md' && file.role === 'instruction',
    ),
    true,
  );
  assertEquals(
    workspaceAfterFiles?.generationPlan.find((step) => step.id === 'initialize_workspace')?.status,
    'succeeded',
  );
  assertEquals(workspaceAfterFinish?.validationFindings, []);
  assertEquals(
    result.run.modelRequestMetadata.map((metadata) => metadata.requestId),
    ['request-plan', 'request-files'],
  );
});
