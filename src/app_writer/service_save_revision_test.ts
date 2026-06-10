import { assertEquals, assertRejects } from '@std/assert';
import { createStaticAppWriterWorkspaceRunner } from '../test_helpers/app_writer_workspace_runner.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';
import {
  AppPackageGenerationFailedError,
  runAppPackageGeneration,
  startAppPackageRevisionRun,
} from './service.ts';
import { importPackage } from '../package_review/intake.ts';
import { getDefaultPackageSnapshotStore } from '../package_review/snapshot_store_fs.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import {
  buildGenerationResult,
  createClock,
  createMemoryPackageSnapshotStore,
  createRevisionAssertingWorkspaceRunner,
  createSequencePreviewer,
  TEST_RUNTIME_CONTRACT_ENV,
} from './service_test_support.ts';

Deno.test('app writer service refuses to save generated packages without preview', async () => {
  const repository = createInMemoryPackageReviewRepository();

  const error = await assertRejects(
    () =>
      runAppPackageGeneration({
        repository,
        workspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult()),
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
        workspaceRunner: createStaticAppWriterWorkspaceRunner(buildGenerationResult()),
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
      const workspace = await repository.getAppGenerationWorkspaceByGenerationId('generation-1');
      const previewStep = workspace?.generationPlan.find((step) => step.id === 'preview_runtime');
      assertEquals(previewStep?.result.summary, 'Passed 1/1 preview assertions.');
      assertEquals(previewStep?.result.assertionCount, 1);
      assertEquals(
        await Deno.readTextFile(`${storageRoot}/phonics-match/0.1.0/manifest.json`),
        buildValidSimpleActivityFiles()[0]?.contents,
      );
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  },
});

Deno.test({
  name:
    'app writer revision runs initialize from a previous package snapshot and save a new pending version',
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const sourceFiles = buildValidSimpleActivityFiles();
    const sourcePackage = buildPackageVersionRecord({
      id: 7,
      appId: 'phonics-match',
      version: '0.1.0',
      title: 'Phonics Match',
      description: 'A small matching game for phonics practice.',
      capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        rubricFile: null,
        maxScore: 100,
      },
      manifestJson: JSON.parse(
        sourceFiles.find((file) => file.path === 'manifest.json')?.contents ?? '{}',
      ) as Record<string, unknown>,
      artifact: {
        snapshotRoot: 'snapshots/phonics-match/0.1.0',
        manifestPath: 'snapshots/phonics-match/0.1.0/manifest.json',
        entrypointPath: 'snapshots/phonics-match/0.1.0/dist/index.html',
        digest: 'sha256:source-phonics-match',
      },
    });
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [sourcePackage],
    });
    const sourceSnapshotStore = createMemoryPackageSnapshotStore({
      [sourcePackage.artifact.snapshotRoot]: sourceFiles,
    });
    const storageRoot = await Deno.makeTempDir({
      prefix: 'lantern-revision-package-',
    });

    try {
      const started = await startAppPackageRevisionRun({
        repository,
        workspaceRunner: createRevisionAssertingWorkspaceRunner(),
        packageSnapshotStore: sourceSnapshotStore,
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
        generationId: 'generation-revision-1',
        ownerId: 'instructor-1',
        promptText: 'Add a printable instructor progress summary.',
        requestedAppId: 'phonics-match',
        sourcePackageVersion: sourcePackage,
        targetVersion: '0.2.0',
        now: createClock([
          '2026-05-14T12:00:00.000Z',
          '2026-05-14T12:00:01.000Z',
          '2026-05-14T12:00:02.000Z',
          '2026-05-14T12:00:03.000Z',
          '2026-05-14T12:00:04.000Z',
        ]),
      });
      const result = await started.continueGeneration();

      assertEquals(result.run.status, 'saved_pending_version');
      assertEquals(result.run.requestedAppId, 'phonics-match');
      assertEquals(result.run.generatedVersion, '0.2.0');
      assertEquals(result.packageVersion?.appId, 'phonics-match');
      assertEquals(result.packageVersion?.version, '0.2.0');
      assertEquals(result.packageVersion?.approvalStatus, 'pending');
      assertEquals(result.run.selectedContext.revision, {
        sourcePackageVersionId: 7,
        sourceAppId: 'phonics-match',
        sourceVersion: '0.1.0',
        sourceTitle: 'Phonics Match',
        sourceDescription: 'A small matching game for phonics practice.',
        sourceCapabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
        sourceGradingMode: 'completion',
        sourceMaxScore: 100,
        targetVersion: '0.2.0',
      });

      const workspace = await repository.getAppGenerationWorkspaceByGenerationId(
        'generation-revision-1',
      );
      const initializeStep = workspace?.generationPlan.find(
        (step) => step.id === 'initialize_workspace',
      );

      assertEquals(initializeStep?.result.initializationMode, 'revision_snapshot');
      assertEquals(
        workspace?.files.some((file) => file.path === '.lantern/contracts/source-package.json'),
        true,
      );
    } finally {
      await Deno.remove(storageRoot, { recursive: true });
    }
  },
});

Deno.test('app writer revision runs fail clearly when source reviewed files are missing', async () => {
  const sourceFiles = buildValidSimpleActivityFiles().filter(
    (file) => file.path !== 'dist/lantern-app.css',
  );
  const sourcePackage = buildPackageVersionRecord({
    id: 7,
    appId: 'phonics-match',
    version: '0.1.0',
    title: 'Phonics Match',
    description: 'A small matching game for phonics practice.',
    capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    grading: {
      mode: 'completion',
      rubricFile: null,
      maxScore: 100,
    },
    manifestJson: JSON.parse(
      sourceFiles.find((file) => file.path === 'manifest.json')?.contents ?? '{}',
    ) as Record<string, unknown>,
    artifact: {
      snapshotRoot: 'snapshots/phonics-match/0.1.0',
      manifestPath: 'snapshots/phonics-match/0.1.0/manifest.json',
      entrypointPath: 'snapshots/phonics-match/0.1.0/dist/index.html',
      digest: 'sha256:source-phonics-match',
    },
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [sourcePackage],
  });
  const sourceSnapshotStore = createMemoryPackageSnapshotStore({
    [sourcePackage.artifact.snapshotRoot]: sourceFiles,
  });
  const started = await startAppPackageRevisionRun({
    repository,
    workspaceRunner: createRevisionAssertingWorkspaceRunner(),
    packageSnapshotStore: sourceSnapshotStore,
    generationId: 'generation-revision-1',
    ownerId: 'instructor-1',
    promptText: 'Add a printable instructor progress summary.',
    requestedAppId: 'phonics-match',
    sourcePackageVersion: sourcePackage,
    targetVersion: '0.2.0',
    now: createClock([
      '2026-05-14T12:00:00.000Z',
      '2026-05-14T12:00:01.000Z',
      '2026-05-14T12:00:02.000Z',
    ]),
  });

  await assertRejects(
    () => started.continueGeneration(),
    Error,
    'missing required reviewed file dist/lantern-app.css',
  );
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
        workspaceRunner: createStaticAppWriterWorkspaceRunner(mismatched),
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
