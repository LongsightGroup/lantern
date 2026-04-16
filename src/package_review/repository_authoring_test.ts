import { assertEquals, assertRejects } from '@std/assert';
import {
  buildAccessibilityReview,
  buildImportedPackageVersion as buildTestImportedPackageVersion,
} from '../test_helpers/package_review.ts';
import type { PackageReviewRepository } from './repository.ts';
import { withRepositoryTestDatabase } from './repository_test_support.ts';

Deno.test('repository seeds authoring drafts from approved browser autograder package versions', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await registerApprovedBrowserAutograderVersion(repository);
    const created = await repository.createAuthoringDraftFromPackageVersion({
      packageVersionId: approvedRecord.id,
      draftId: 'draft-template-app',
      createdAt: '2026-04-08T16:00:00Z',
    });
    const fetched = await repository.getAuthoringDraftById(created.draftId);

    assertEquals(created.draftId, 'draft-template-app');
    assertEquals(created.packageVersionId, approvedRecord.id);
    assertEquals(created.authoringKind, 'browser_autograder');
    assertEquals(created.authoringPaths, [
      '/grading/specs/checks.spec.js',
      '/evidence/example-output.json',
    ]);
    assertEquals(created.baseSnapshotRoot, approvedRecord.artifact.snapshotRoot);
    assertEquals(created.savedSource, 'manual');
    assertEquals(created.files, []);
    assertEquals(fetched, created);
  });
});

Deno.test('repository rejects saving authoring draft files outside the approved contract', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await registerApprovedBrowserAutograderVersion(repository);
    const draft = await repository.createAuthoringDraftFromPackageVersion({
      packageVersionId: approvedRecord.id,
      draftId: 'draft-template-app',
      createdAt: '2026-04-08T16:05:00Z',
    });

    await assertRejects(
      () =>
        repository.saveAuthoringDraftFiles({
          draftId: draft.draftId,
          files: [
            {
              relativePath: 'dist/app.js',
              contents: 'console.log("nope");',
            },
          ],
          latestPromptText: null,
          latestGenerationNotes: [],
          savedSource: 'manual',
          updatedAt: '2026-04-08T16:06:00Z',
        }),
      Error,
      'Authoring draft file /dist/app.js is outside the approved authoring file set.',
    );
  });
});

Deno.test('repository stores AI authoring provenance without mutating the approved snapshot root', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await registerApprovedBrowserAutograderVersion(repository);
    const draft = await repository.createAuthoringDraftFromPackageVersion({
      packageVersionId: approvedRecord.id,
      draftId: 'draft-template-app',
      createdAt: '2026-04-08T16:10:00Z',
    });

    const saved = await repository.saveAuthoringDraftFiles({
      draftId: draft.draftId,
      files: [
        {
          relativePath: '/grading/specs/checks.spec.js',
          contents: 'describe("alt text", () => {});\n',
        },
        {
          relativePath: '/evidence/example-output.json',
          contents: '{"score":100}\n',
        },
      ],
      latestPromptText: 'Write a browser_autograder check for missing alt text.',
      latestGenerationNotes: ['Added a structure-focused browser autograder check.'],
      savedSource: 'ai',
      updatedAt: '2026-04-08T16:12:00Z',
    });
    const packageVersion = await repository.getPackageVersionById(approvedRecord.id);

    assertEquals(saved.latestPromptText, 'Write a browser_autograder check for missing alt text.');
    assertEquals(saved.latestGenerationNotes, [
      'Added a structure-focused browser autograder check.',
    ]);
    assertEquals(saved.savedSource, 'ai');
    assertEquals(
      saved.files.map((file) => file.relativePath),
      ['/grading/specs/checks.spec.js', '/evidence/example-output.json'],
    );
    assertEquals(packageVersion?.artifact.snapshotRoot, approvedRecord.artifact.snapshotRoot);
  });
});

Deno.test('repository records the last preview timestamp for authoring drafts', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await registerApprovedBrowserAutograderVersion(repository);
    const draft = await repository.createAuthoringDraftFromPackageVersion({
      packageVersionId: approvedRecord.id,
      draftId: 'draft-template-app',
      createdAt: '2026-04-08T16:15:00Z',
    });

    const previewed = await repository.markAuthoringDraftPreviewed({
      draftId: draft.draftId,
      previewedAt: '2026-04-08T16:18:00Z',
    });

    assertEquals(previewed.lastPreviewedAt, '2026-04-08T16:18:00.000Z');
    assertEquals(previewed.updatedAt, '2026-04-08T16:18:00.000Z');
  });
});

async function registerApprovedBrowserAutograderVersion(
  repository: Pick<PackageReviewRepository, 'registerPackageVersion' | 'approvePackageVersion'>,
) {
  const registered = await repository.registerPackageVersion(
    buildBrowserAutograderImportedPackageVersion(),
  );

  return await repository.approvePackageVersion({
    id: registered.id,
    reviewNotes: 'Approved for authoring draft tests.',
    accessibilityReview: buildAccessibilityReview(),
  });
}

function buildBrowserAutograderImportedPackageVersion() {
  return buildTestImportedPackageVersion({
    appId: 'template-app',
    version: '0.1.0',
    title: 'Template App',
    description: 'Minimal browser autograder starter.',
    grading: {
      mode: 'manual',
      rubricFile: null,
      maxScore: 100,
    },
    manifestJson: {
      app_id: 'template-app',
      version: '0.1.0',
      title: 'Template App',
      entrypoint: '/dist/index.html',
      authoring: {
        kind: 'browser_autograder',
        grader_spec_files: ['/grading/specs/checks.spec.js'],
        evidence_example_file: '/evidence/example-output.json',
      },
    },
    artifact: {
      snapshotRoot: 'var/packages/template-app/0.1.0',
      manifestPath: 'var/packages/template-app/0.1.0/manifest.json',
      entrypointPath: 'var/packages/template-app/0.1.0/dist/index.html',
      digest: 'sha256:template-app-0-1-0',
    },
  });
}
