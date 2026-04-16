import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { renderPreviewAssertionResult } from './local_preview_assertion_report.ts';
import {
  type LocalPreviewAssertionRunResult,
  runLocalPreviewAssertions,
} from './local_preview_assertions.ts';
import { collectWatchBatch, runWatchMode } from './watch.ts';

const TEMPLATE_APP_ROOT = 'examples/apps/template';

Deno.test('runLocalPreviewAssertions passes the template app preview checks', async () => {
  const result = await runLocalPreviewAssertions(TEMPLATE_APP_ROOT);

  assertSuccessfulRun(result);
  assertEquals(result.failedCount, 0);
  assertEquals(result.passedCount, result.results.length);
  assertEquals(result.results.length, 4);
});

Deno.test('runLocalPreviewAssertions reports missing selectors with test name and selector', async () => {
  const tempRoot = await cloneTemplateApp();

  try {
    await writePreviewTests(tempRoot, [
      {
        name: 'missing title',
        assert: {
          selector: "[data-test='missing-title']",
        },
      },
    ]);

    const result = await runLocalPreviewAssertions(tempRoot);

    assertSuccessfulRun(result);
    assertEquals(result.failedCount, 1);
    assertEquals(result.results[0]?.code, 'selector_not_found');
    assertEquals(result.results[0]?.name, 'missing title');
    assertEquals(result.results[0]?.selector, "[data-test='missing-title']");
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('runLocalPreviewAssertions reports exact text mismatches', async () => {
  const tempRoot = await cloneTemplateApp();

  try {
    await writePreviewTests(tempRoot, [
      {
        name: 'wrong title',
        assert: {
          selector: "[data-test='app-title']",
          text: 'Wrong Title',
        },
      },
    ]);

    const result = await runLocalPreviewAssertions(tempRoot);

    assertSuccessfulRun(result);
    assertEquals(result.failedCount, 1);
    assertEquals(result.results[0]?.code, 'text_mismatch');
    assertEquals(result.results[0]?.actualText, 'Template App');
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('runLocalPreviewAssertions reports contains mismatches', async () => {
  const tempRoot = await cloneTemplateApp();

  try {
    await writePreviewTests(tempRoot, [
      {
        name: 'wrong prompt substring',
        assert: {
          selector: "[data-test='question-prompt']",
          contains: 'Not In Prompt',
        },
      },
    ]);

    const result = await runLocalPreviewAssertions(tempRoot);

    assertSuccessfulRun(result);
    assertEquals(result.failedCount, 1);
    assertEquals(result.results[0]?.code, 'contains_mismatch');
    assertStringIncludes(result.results[0]?.message ?? '', 'to contain');
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('renderPreviewAssertionResult surfaces grouped validation diagnostics', () => {
  const rendered = renderPreviewAssertionResult({
    ok: false,
    kind: 'validation_failed',
    packageRoot: '/tmp/example-app',
    diagnostics: [
      {
        code: 'preview_tests_empty',
        severity: 'error',
        file: '/preview/tests.json',
        message: 'Preview tests file must contain at least one named assertion.',
        fix: 'Add at least one named preview test to /preview/tests.json.',
      },
    ],
    issues: [],
    warnings: [],
  });

  assertEquals(rendered.exitCode, 1);
  assertStringIncludes(rendered.output, 'File /preview/tests.json');
  assertStringIncludes(rendered.output, 'Fix: Add at least one named preview test');
});

Deno.test('collectWatchBatch merges rapid file events into one rerun batch', async () => {
  const iterator = createAsyncIterator([
    {
      paths: ['preview/tests.json'],
    },
    {
      paths: ['dist/app.js'],
    },
  ]);

  const batch = await collectWatchBatch(iterator, 10);

  assertEquals(batch, ['dist/app.js', 'preview/tests.json']);
});

Deno.test('runWatchMode performs the initial run and one debounced rerun', async () => {
  const iterator = createAsyncIterator([
    {
      paths: ['preview/tests.json'],
    },
    {
      paths: ['dist/app.js'],
    },
  ]);
  const runs: string[][] = [];

  await runWatchMode({
    iterator,
    once: false,
    debounceMs: 10,
    log: () => {},
    runCycle(changedPaths) {
      runs.push(changedPaths);
      return Promise.resolve(0);
    },
  });

  assertEquals(runs, [[], ['dist/app.js', 'preview/tests.json']]);
});

async function cloneTemplateApp(): Promise<string> {
  const tempRoot = await Deno.makeTempDir({
    prefix: 'lantern-preview-assertions-',
  });
  const outputRoot = `${tempRoot}/template-app`;

  await copyDirectory(TEMPLATE_APP_ROOT, outputRoot);

  return outputRoot;
}

async function copyDirectory(sourceRoot: string, destinationRoot: string): Promise<void> {
  await Deno.mkdir(destinationRoot, { recursive: true });

  for await (const entry of Deno.readDir(sourceRoot)) {
    const sourcePath = `${sourceRoot}/${entry.name}`;
    const destinationPath = `${destinationRoot}/${entry.name}`;

    if (entry.isDirectory) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile) {
      await Deno.copyFile(sourcePath, destinationPath);
    }
  }
}

async function writePreviewTests(packageRoot: string, tests: unknown): Promise<void> {
  await Deno.writeTextFile(`${packageRoot}/preview/tests.json`, JSON.stringify(tests, null, 2));
}

function assertSuccessfulRun(
  result: LocalPreviewAssertionRunResult,
): asserts result is Extract<LocalPreviewAssertionRunResult, { ok: true }> {
  assert(result.ok, `Expected successful preview assertion run: ${JSON.stringify(result)}`);
}

function createAsyncIterator(
  values: Array<{
    paths: string[];
  }>,
): AsyncIterator<{
  paths: string[];
}> {
  let index = 0;

  return {
    next(): Promise<IteratorResult<{ paths: string[] }>> {
      if (index >= values.length) {
        return Promise.resolve({
          done: true,
          value: undefined,
        });
      }

      const value = values[index];

      if (!value) {
        throw new Error('Expected watch test event.');
      }

      index += 1;

      return Promise.resolve({
        done: false,
        value,
      });
    },
  };
}
