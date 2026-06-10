import { assertEquals, assertRejects } from '@std/assert';
import { createStaticAppWriterWorkspaceRunner } from '../test_helpers/app_writer_workspace_runner.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';
import { AppPackageGenerationFailedError, runAppPackageGeneration } from './service.ts';
import { createTypeScriptAppPackageSourceCompiler } from './typescript_source_compiler.ts';
import type { AppWriterWorkspaceRunner } from './workspace_runner.ts';
import { createInMemoryPackageReviewRepository } from '../test_helpers/package_review.ts';
import {
  buildGenerationResult,
  buildTypeScriptAuthoringPackageFiles,
  createClock,
  createSequencePreviewer,
} from './service_test_support.ts';

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
        workspaceRunner: createStaticAppWriterWorkspaceRunner(invalidPackage),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        maxRepairAttempts: 0,
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
    workspaceRunner: createStaticAppWriterWorkspaceRunner(invalidPackage, [
      buildGenerationResult(),
    ]),
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
  const workspace = await repository.getAppGenerationWorkspaceByGenerationId('generation-1');

  assertEquals(persisted?.repairAttemptCount, 1);
  assertEquals(persisted?.validationFindings, []);
  assertEquals(
    workspace?.files.some((file) => file.path === 'server/worker.ts'),
    false,
  );
  assertEquals(
    workspace?.files.some((file) => file.path === 'AGENTS.md' && file.role === 'instruction'),
    true,
  );
});

Deno.test('app writer service preserves validation findings when repair provider fails', async () => {
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
  const workspaceRunner: AppWriterWorkspaceRunner = {
    ...createStaticAppWriterWorkspaceRunner(invalidPackage),
    repair(_input) {
      return Promise.reject(new Error('3045: Unknown internal error'));
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
    '3045: Unknown internal error',
  );

  assertEquals(error.run.status, 'failed');
  assertEquals(
    error.run.validationFindings.some((finding) => finding.code === 'file_path_not_allowed'),
    true,
  );
  assertEquals(
    error.run.validationFindings.at(-1)?.code,
    'generation_model_provider_internal_error',
  );
  assertEquals(error.run.validationFindings.at(-1)?.detail, {
    providerError: 'internal_server_error',
  });

  const persisted = await repository.getAppGenerationRunById('generation-1');
  const workspace = await repository.getAppGenerationWorkspaceByGenerationId('generation-1');
  const repairStep = workspace?.generationPlan.find((step) => step.id === 'repair_if_needed');

  assertEquals(persisted?.validationFindings, error.run.validationFindings);
  assertEquals(workspace?.validationFindings, error.run.validationFindings);
  assertEquals(repairStep?.status, 'failed');
});

Deno.test('app writer service compiles TypeScript authoring source before validation', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const result = await runAppPackageGeneration({
    repository,
    workspaceRunner: createStaticAppWriterWorkspaceRunner(
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
    result.generation.files.some(
      (file) => file.path === 'source/app.ts' && file.role === 'evidence',
    ),
    true,
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
  assertEquals(result.run.selectedContext.authoringMode, 'typescript');
});

Deno.test('app writer service keeps TypeScript authoring files out of package validation findings', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner: createStaticAppWriterWorkspaceRunner(
          buildGenerationResult({
            files: buildTypeScriptAuthoringPackageFiles({
              appSource:
                'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("missing gateway");\n  await gateway.writeLocalState({ done: true });\n}\nvoid start();\n',
            }),
          }),
        ),
        sourceCompiler: createTypeScriptAppPackageSourceCompiler(),
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        maxRepairAttempts: 0,
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
          '2026-05-14T12:00:03.000Z',
          '2026-05-14T12:00:04.000Z',
        ]),
      }),
    AppPackageGenerationFailedError,
    'Generated package failed validation.',
  );

  assertEquals(
    error.run.validationFindings.some((finding) => finding.code === 'typescript_diagnostic'),
    true,
  );
  assertEquals(
    error.run.validationFindings.some(
      (finding) =>
        finding.code === 'file_path_not_allowed' &&
        (finding.file === 'source/app.ts' || finding.file === 'source/content_model.ts'),
    ),
    false,
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
        workspaceRunner: createStaticAppWriterWorkspaceRunner(invalidPackage, [invalidPackage]),
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
    workspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult(), [
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
