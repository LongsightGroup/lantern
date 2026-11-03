import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'vite-plus/test';
import { tmpdir } from 'node:os';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildPackageVersionRecord } from '../test_helpers/package_review.ts';
import type { AuthoringDraftRecord } from '../package_review/types.ts';
import {
  buildAuthoringDraftSnapshotRoot,
  materializeDraftPreviewPackageVersion,
} from './draft_snapshot.ts';

test('materializeDraftPreviewPackageVersion overlays saved draft files into var/authoring-drafts snapshots', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lantern-authoring-source-'));
  const snapshotRoot = buildAuthoringDraftSnapshotRoot(
    'draft-template-app',
    '2026-04-08T17:00:00Z',
  );

  try {
    await seedTemplateSnapshot(sourceRoot);

    const packageVersion = buildPackageVersionRecord({
      id: 101,
      appId: 'template-app',
      version: '0.1.0',
      title: 'Template App',
      approvalStatus: 'approved',
      manifestJson: {
        app_id: 'template-app',
        version: '0.1.0',
        title: 'Template App',
        preview: {
          fixtures_file: '/preview/fixtures.json',
          tests_file: '/preview/tests.json',
        },
        authoring: {
          kind: 'browser_autograder',
          grader_spec_files: ['/grading/specs/checks.spec.js'],
          evidence_example_file: '/evidence/example-output.json',
        },
      },
      artifact: {
        snapshotRoot: sourceRoot,
        manifestPath: `${sourceRoot}/manifest.json`,
        entrypointPath: `${sourceRoot}/dist/index.html`,
        digest: 'sha256:template-app-approved-source',
      },
    });
    const draft: AuthoringDraftRecord = {
      draftId: 'draft-template-app',
      packageVersionId: 101,
      appId: 'template-app',
      packageVersion: '0.1.0',
      packageTitle: 'Template App',
      authoringKind: 'browser_autograder',
      authoringPaths: ['/grading/specs/checks.spec.js', '/evidence/example-output.json'],
      baseSnapshotRoot: sourceRoot,
      latestPromptText: 'Write a browser_autograder check for missing alt text.',
      latestGenerationNotes: ['Added alt text coverage assertions.'],
      savedSource: 'ai',
      lastPreviewedAt: null,
      createdAt: '2026-04-08T16:55:00Z',
      updatedAt: '2026-04-08T16:56:00Z',
      files: [
        {
          draftId: 'draft-template-app',
          relativePath: '/grading/specs/checks.spec.js',
          contents:
            'describe("template authoring checks", () => {\n  it("checks alt text coverage", () => {});\n});\n',
          sequence: 1,
        },
      ],
    };

    const previewPackageVersion = await materializeDraftPreviewPackageVersion({
      draft,
      packageVersion,
      createdAt: '2026-04-08T17:00:00Z',
    });
    const materializedSpec = await readFile(
      `${previewPackageVersion.artifact.snapshotRoot}/grading/specs/checks.spec.js`,
      'utf8',
    );
    const copiedManifest = await readFile(
      `${previewPackageVersion.artifact.snapshotRoot}/manifest.json`,
      'utf8',
    );

    assertEquals(previewPackageVersion.artifact.snapshotRoot, snapshotRoot);
    assertStringIncludes(previewPackageVersion.artifact.snapshotRoot, 'var/authoring-drafts/');
    assertStringIncludes(materializedSpec, 'checks alt text coverage');
    assertStringIncludes(copiedManifest, '"template-app"');
    assertEquals(packageVersion.artifact.snapshotRoot, sourceRoot);
  } finally {
    await rm(sourceRoot, { recursive: true });
    await rm('var/authoring-drafts', { recursive: true }).catch(() => {});
  }
});

async function seedTemplateSnapshot(root: string): Promise<void> {
  await mkdir(`${root}/dist`, { recursive: true });
  await mkdir(`${root}/preview`, { recursive: true });
  await mkdir(`${root}/grading/specs`, { recursive: true });
  await mkdir(`${root}/evidence`, { recursive: true });
  await writeFile(`${root}/manifest.json`, '{"app_id":"template-app"}\n');
  await writeFile(`${root}/dist/index.html`, '<!doctype html><title>Template</title>\n');
  await writeFile(
    `${root}/preview/fixtures.json`,
    '{"launch":{"user_role":"instructor","course_id":"course_demo","assignment_id":null,"activity_id":"template-app"},"attempt_id":"attempt_demo","local_state":null}\n',
  );
  await writeFile(`${root}/preview/tests.json`, '[]\n');
  await writeFile(
    `${root}/grading/specs/checks.spec.js`,
    'describe("template authoring checks", () => {\n  it("renders the starter title", () => {});\n});\n',
  );
  await writeFile(`${root}/evidence/example-output.json`, '{"status":"ok"}\n');
}
