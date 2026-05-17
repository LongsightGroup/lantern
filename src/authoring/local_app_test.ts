import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { type LocalAppValidationDiagnostic, preflightLocalAppPackageSource } from './local_app.ts';
import { renderValidationFailure, serializeValidationResult } from '../../tools/app_validate.ts';
import {
  createMemoryPackageSource,
  type MemoryPackageSourceFile,
} from '../package_review/package_source.ts';

Deno.test('preflightLocalAppPackageSource rejects missing preview config with manifest-scoped fix guidance', async () => {
  const manifest = buildManifest();

  delete manifest.preview;

  const result = await preflightLocalAppPackageSource(buildPackageSource({ manifest }));

  assertEquals(result.ok, false);

  if (result.ok) {
    throw new Error('Expected preflight to fail without preview config.');
  }

  assertEquals(result.diagnostics[0]?.field, '/preview');
  assertStringIncludes(
    result.diagnostics[0]?.message ?? '',
    'Lantern authoring requires preview.fixtures_file and preview.tests_file.',
  );
  assertStringIncludes(
    result.diagnostics[0]?.fix ?? '',
    'Add preview.fixtures_file and preview.tests_file to manifest.json',
  );
});

Deno.test('preflightLocalAppPackageSource rejects empty preview tests with file-scoped fix guidance', async () => {
  const result = await preflightLocalAppPackageSource(buildPackageSource({ previewTests: [] }));

  assertEquals(result.ok, false);

  if (result.ok) {
    throw new Error('Expected preflight to fail for empty preview tests.');
  }

  assertEquals(result.diagnostics[0]?.file, '/preview/tests.json');
  assertEquals(result.diagnostics[0]?.code, 'preview_tests_empty');
  assertStringIncludes(result.diagnostics[0]?.fix ?? '', 'Add at least one named preview test');
});

Deno.test('preflightLocalAppPackageSource rejects duplicate preview test names', async () => {
  const result = await preflightLocalAppPackageSource(
    buildPackageSource({
      previewTests: [
        {
          name: 'renders title',
          assert: { selector: 'main', contains: 'Uploaded Quiz' },
        },
        {
          name: 'renders title',
          assert: { selector: 'main', contains: 'Uploaded Quiz' },
        },
      ],
    }),
  );

  assertEquals(result.ok, false);

  if (result.ok) {
    throw new Error('Expected duplicate preview test names to fail.');
  }

  assertEquals(result.diagnostics[0]?.code, 'preview_test_duplicate_name');
  assertStringIncludes(
    result.diagnostics[0]?.message ?? '',
    'Preview test "renders title" appears more than once.',
  );
});

Deno.test('renderValidationFailure groups diagnostics by manifest field and file', () => {
  const output = renderValidationFailure({
    ok: false,
    diagnostics: [
      buildDiagnostic({
        field: '/preview',
        message: 'Preview config missing.',
        fix: 'Add preview config.',
      }),
      buildDiagnostic({
        file: '/preview/tests.json',
        message: 'Preview tests file must contain at least one named assertion.',
        fix: 'Add one preview test.',
      }),
      buildDiagnostic({
        file: '/preview/tests.json',
        code: 'preview_test_duplicate_name',
        message: 'Preview test "renders title" appears more than once.',
        fix: 'Rename duplicate preview tests.',
      }),
    ],
    issues: [],
    warnings: [],
  });

  assertStringIncludes(output, 'Manifest /preview');
  assertStringIncludes(output, 'File /preview/tests.json');
  assertStringIncludes(output, 'Fix: Add one preview test.');
  assertStringIncludes(output, 'Fix: Rename duplicate preview tests.');
});

Deno.test('serializeValidationResult emits stable JSON for success and failure', async () => {
  const source = buildPackageSource();
  const success = await preflightLocalAppPackageSource(source);

  if (!success.ok) {
    throw new Error(`Expected valid package source: ${JSON.stringify(success.diagnostics)}`);
  }

  const successJson = JSON.parse(
    serializeValidationResult({
      ...success,
      appPackage: {
        rootPath: '/tmp/valid-app',
        source,
        ...success.validatedPackage,
      },
    }),
  ) as Record<string, unknown>;

  assertEquals(successJson.ok, true);
  assertEquals((successJson.app as Record<string, unknown>).previewTestCount, 1);

  const failureJson = JSON.parse(
    serializeValidationResult({
      ok: false,
      diagnostics: [
        buildDiagnostic({
          file: '/preview/tests.json',
          message: 'Preview tests file must contain at least one named assertion.',
          fix: 'Add one preview test.',
        }),
      ],
      issues: [],
      warnings: [],
    }),
  ) as Record<string, unknown>;

  assertEquals(failureJson.ok, false);
  const diagnostics = failureJson.diagnostics as unknown[];
  const firstDiagnostic = diagnostics[0] as Record<string, unknown> | undefined;
  assert(firstDiagnostic);
  assertEquals(firstDiagnostic.file, '/preview/tests.json');
});

function buildPackageSource(
  input: {
    manifest?: Record<string, unknown>;
    previewFixtures?: unknown;
    previewTests?: unknown;
    entrypointHtml?: string;
    contentJson?: unknown;
  } = {},
) {
  return createMemoryPackageSource(buildPackageFiles(input));
}

function buildPackageFiles(
  input: {
    manifest?: Record<string, unknown>;
    previewFixtures?: unknown;
    previewTests?: unknown;
    entrypointHtml?: string;
    contentJson?: unknown;
  } = {},
): MemoryPackageSourceFile[] {
  return [
    {
      relativePath: 'manifest.json',
      bytes: JSON.stringify(input.manifest ?? buildManifest(), null, 2),
    },
    {
      relativePath: 'dist/index.html',
      bytes:
        input.entrypointHtml ??
        '<!doctype html><html lang="en"><body><main>Uploaded Quiz</main></body></html>',
    },
    {
      relativePath: 'content/activity.json',
      bytes: JSON.stringify(input.contentJson ?? { cards: [] }, null, 2),
    },
    {
      relativePath: 'preview/fixtures.json',
      bytes: JSON.stringify(
        input.previewFixtures ?? {
          launch: {
            user_role: 'learner',
            course_id: 'course-123',
            assignment_id: 'assignment-456',
            activity_id: 'activity-1',
          },
          attempt_id: 'attempt-123',
          local_state: null,
        },
        null,
        2,
      ),
    },
    {
      relativePath: 'preview/tests.json',
      bytes: JSON.stringify(
        input.previewTests ?? [
          {
            name: 'renders title',
            assert: {
              selector: 'main',
              contains: 'Uploaded Quiz',
            },
          },
        ],
        null,
        2,
      ),
    },
  ];
}

function buildManifest(): Record<string, unknown> {
  return {
    schema_version: '1',
    app_id: 'uploaded-quiz',
    version: '0.1.0',
    title: 'Uploaded Quiz',
    description: 'A reviewed package used for validator coverage.',
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
      mode: 'completion',
      max_score: 100,
    },
    content_files: ['/content/activity.json'],
    preview: {
      fixtures_file: '/preview/fixtures.json',
      tests_file: '/preview/tests.json',
    },
  };
}

function buildDiagnostic(
  input: Partial<LocalAppValidationDiagnostic> &
    Pick<LocalAppValidationDiagnostic, 'message' | 'fix'>,
): LocalAppValidationDiagnostic {
  return {
    code: input.code ?? 'manual',
    severity: 'error',
    ...(input.field === undefined ? {} : { field: input.field }),
    ...(input.file === undefined ? {} : { file: input.file }),
    message: input.message,
    fix: input.fix,
  };
}
