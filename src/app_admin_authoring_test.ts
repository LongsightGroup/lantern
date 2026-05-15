import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import type {
  BrowserAutograderDraftFileInput,
  BrowserAutograderDraftReferenceExample,
} from './authoring/browser_autograder_draft_generator.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

const TEMPLATE_SNAPSHOT_ROOT = 'examples/apps/template';
const AUTHORING_PROMPT = 'Write a browser_autograder check for missing alt text.';
const GENERATION_NOTE = 'Added a browser_autograder assertion for alt text coverage.';
const GENERATED_SPEC = `describe("template authoring checks", () => {
  it("checks alt text coverage", () => {});
});
`;

Deno.test('GET authoring routes expose an explicit entry point and prompt-first draft page', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildTemplateAuthoringPackageVersionRecord()],
  });
  const app = createApp({
    getRepository: () => repository,
  });

  const detailResponse = await app.request(
    'http://localhost/admin/packages/template-app/versions/0.1.0',
  );
  const authoringResponse = await app.request(
    'http://localhost/admin/packages/template-app/versions/0.1.0/authoring',
  );

  assertEquals(detailResponse.status, 200);
  assertEquals(authoringResponse.status, 200);

  const detailBody = await detailResponse.text();
  const authoringBody = await authoringResponse.text();

  assertStringIncludes(detailBody, 'Open authoring draft');
  assertStringIncludes(detailBody, '/admin/packages/template-app/versions/0.1.0/authoring');
  assertStringIncludes(authoringBody, 'name="prompt"');
  assertStringIncludes(authoringBody, 'Generate draft');
  assertStringIncludes(authoringBody, 'Save draft');
  assertStringIncludes(authoringBody, 'Back to version details');
});

Deno.test('POST /authoring/generate returns notes and diffs without saving the draft yet', async () => {
  const capturedInputs: Array<{
    appId: string;
    packageVersion: string;
    prompt: string;
    currentFiles: BrowserAutograderDraftFileInput[];
    referenceExamples: BrowserAutograderDraftReferenceExample[];
  }> = [];
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildTemplateAuthoringPackageVersionRecord()],
  });
  const app = createApp({
    getRepository: () => repository,
    browserAutograderDraftGenerator: {
      generate(input) {
        capturedInputs.push(input);

        return Promise.resolve({
          files: [
            {
              path: '/grading/specs/checks.spec.js',
              contents: GENERATED_SPEC,
            },
          ],
          notes: [GENERATION_NOTE],
        });
      },
    },
  });
  const formData = new FormData();
  formData.set('prompt', AUTHORING_PROMPT);

  const response = await app.request(
    'https://lantern.example/admin/packages/template-app/versions/0.1.0/authoring/generate',
    {
      method: 'POST',
      headers: { Origin: 'https://lantern.example' },
      body: formData,
    },
  );
  const draft = await repository.createAuthoringDraftFromPackageVersion({
    packageVersionId: 101,
    draftId: 'inspect-template-draft',
    createdAt: '2026-04-08T16:40:00Z',
  });

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Generation notes');
  assertStringIncludes(body, 'Draft diff');
  assertStringIncludes(body, 'Lantern did not save these changes yet.');
  assertStringIncludes(body, GENERATION_NOTE);
  assertStringIncludes(body, '/grading/specs/checks.spec.js');
  assertEquals(draft.files, []);
  assertEquals(draft.latestPromptText, null);
  const capturedInput = capturedInputs[0];

  if (!capturedInput) {
    throw new Error('Expected fake browser-autograder draft generator input.');
  }

  assertEquals(capturedInput.prompt, AUTHORING_PROMPT);
  assertEquals(
    capturedInput.currentFiles.map((file) => file.path),
    ['/grading/specs/checks.spec.js', '/evidence/example-output.json'],
  );
  assertEquals(
    capturedInput.referenceExamples.map((example) => example.appId),
    ['template-app', 'web-checkup', 'typescript-ladder-game'],
  );
  assertStringIncludes(capturedInput.currentFiles[0]?.contents ?? '', 'template authoring checks');
});

Deno.test('POST /authoring/save persists generated files and AI provenance into the draft record', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildTemplateAuthoringPackageVersionRecord()],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();
  formData.set('prompt', AUTHORING_PROMPT);
  formData.append('generationNote', GENERATION_NOTE);
  formData.append('generatedPath', '/grading/specs/checks.spec.js');
  formData.append('generatedContents', GENERATED_SPEC);

  const response = await app.request(
    'https://lantern.example/admin/packages/template-app/versions/0.1.0/authoring/save',
    {
      method: 'POST',
      headers: { Origin: 'https://lantern.example' },
      body: formData,
    },
  );
  const draft = await repository.createAuthoringDraftFromPackageVersion({
    packageVersionId: 101,
    draftId: 'inspect-template-draft',
    createdAt: '2026-04-08T16:45:00Z',
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get('location'),
    '/admin/packages/template-app/versions/0.1.0/authoring?saved=1',
  );
  assertEquals(draft.savedSource, 'ai');
  assertEquals(draft.latestPromptText, AUTHORING_PROMPT);
  assertEquals(draft.latestGenerationNotes, [GENERATION_NOTE]);
  assertEquals(
    draft.files.map((file) => file.relativePath),
    ['/grading/specs/checks.spec.js'],
  );
  assertStringIncludes(draft.files[0]?.contents ?? '', 'checks alt text coverage');
});

function buildTemplateAuthoringPackageVersionRecord() {
  return buildPackageVersionRecord({
    id: 101,
    appId: 'template-app',
    version: '0.1.0',
    title: 'Template App',
    description: 'Minimal browser autograder starter.',
    approvalStatus: 'approved',
    reviewNotes: 'Approved for authoring route tests.',
    reviewedAt: '2026-04-08T16:20:00Z',
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
      snapshotRoot: TEMPLATE_SNAPSHOT_ROOT,
      manifestPath: `${TEMPLATE_SNAPSHOT_ROOT}/manifest.json`,
      entrypointPath: `${TEMPLATE_SNAPSHOT_ROOT}/dist/index.html`,
      digest: 'sha256:template-app-approved-authoring',
    },
  });
}
