import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { copyFile, readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'vite-plus/test';
import { tmpdir } from 'node:os';
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { renderPreviewAssertionResult } from './local_preview_assertion_report.ts';
import {
  type LocalPreviewAssertionRunResult,
  runLocalPreviewAssertions,
} from './local_preview_assertions.ts';
import { collectWatchBatch, runWatchMode } from './watch.ts';

const TEMPLATE_APP_ROOT = 'examples/apps/template';

test('runLocalPreviewAssertions passes the template app preview checks', async () => {
  const result = await runLocalPreviewAssertions(TEMPLATE_APP_ROOT);

  assertSuccessfulRun(result);
  assertEquals(result.failedCount, 0);
  assertEquals(result.passedCount, result.results.length);
  assertEquals(result.results.length, 4);
});

test('runLocalPreviewAssertions reports missing selectors with test name and selector', async () => {
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
    await rm(tempRoot, { recursive: true });
  }
});

test('runLocalPreviewAssertions reports exact text mismatches', async () => {
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
    await rm(tempRoot, { recursive: true });
  }
});

test('runLocalPreviewAssertions reports contains mismatches', async () => {
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
    await rm(tempRoot, { recursive: true });
  }
});

test('preview CLI blocks constructor escapes to host environment, files, and subprocesses', async () => {
  const packageRoot = await cloneTemplateApp();
  const canaryPath = join(packageRoot, 'host-canary.txt');
  const childMarker = join(packageRoot, 'child-marker.txt');
  try {
    await writeFile(canaryPath, 'host-file-canary');
    await writeFile(
      join(packageRoot, 'dist/app.js'),
      `
      const getProcess = () => window.constructor.constructor('return process')();
      const probes = [
        () => getProcess().env.LANTERN_PREVIEW_HOST_CANARY,
        () => getProcess().getBuiltinModule('node:fs').readFileSync(${JSON.stringify(canaryPath)}, 'utf8'),
        () => getProcess().getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(canaryPath)}, 'overwritten'),
        () => getProcess().getBuiltinModule('node:child_process').execFileSync(getProcess().execPath, [
          '-e', ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(childMarker)}, 'executed')`)}
        ]),
      ];
      document.querySelector('[data-test="app-title"]').textContent = probes.map(probe => {
        try { probe(); return 'escaped'; } catch { return 'blocked'; }
      }).join('|');
    `,
    );
    await writePreviewTests(packageRoot, [
      {
        name: 'host authority is unavailable',
        assert: { selector: '[data-test="app-title"]', text: 'blocked|blocked|blocked|blocked' },
      },
    ]);
    await writeFile(
      join(packageRoot, '.puppeteerrc.cjs'),
      `require('node:fs').writeFileSync(${JSON.stringify(childMarker)}, 'config-executed'); module.exports = {};`,
    );
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL('../../tools/app_test_preview.ts', import.meta.url)), packageRoot],
      {
        cwd: packageRoot,
        env: { ...process.env, LANTERN_PREVIEW_HOST_CANARY: 'synthetic-host-secret' },
        timeout: 20_000,
      },
    );
    assertStringIncludes(stdout, '1/1 checks passed');
    assertEquals(await readFile(canaryPath, 'utf8'), 'host-file-canary');
    assertEquals(await readFile(childMarker, 'utf8').catch(() => null), null);
  } finally {
    await rm(packageRoot, { recursive: true });
  }
});

test('preview blocks access to host files and external HTTP requests', async () => {
  const packageRoot = await cloneTemplateApp();
  let hostRequests = 0;
  const server = createServer((_request, response) => {
    hostRequests += 1;
    response.end('private-host-response');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    await writeFile(
      join(packageRoot, 'dist/app.js'),
      `
      Promise.all([
        fetch('file:///etc/passwd').then(() => 'escaped', () => 'blocked'),
        fetch('http://127.0.0.1:${address.port}/private').then(() => 'escaped', () => 'blocked'),
        fetch('https://network-probe.invalid/private').then(() => 'escaped', () => 'blocked'),
      ]).then(results => {
        document.querySelector('[data-test="app-title"]').textContent = results.join('|');
      });
    `,
    );
    const result = await runLocalPreviewAssertions(packageRoot);
    assert(!result.ok);
    assertEquals(result.kind, 'runtime_failed');
    assertEquals(hostRequests, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(packageRoot, { recursive: true });
  }
});

test('renderPreviewAssertionResult surfaces grouped validation diagnostics', () => {
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

test('collectWatchBatch merges rapid file events into one rerun batch', async () => {
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

test('runWatchMode performs the initial run and one debounced rerun', async () => {
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'lantern-preview-assertions-'));
  const outputRoot = `${tempRoot}/template-app`;

  await copyDirectory(TEMPLATE_APP_ROOT, outputRoot);

  return outputRoot;
}

async function copyDirectory(sourceRoot: string, destinationRoot: string): Promise<void> {
  await mkdir(destinationRoot, { recursive: true });

  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const sourcePath = `${sourceRoot}/${entry.name}`;
    const destinationPath = `${destinationRoot}/${entry.name}`;

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function writePreviewTests(packageRoot: string, tests: unknown): Promise<void> {
  await writeFile(`${packageRoot}/preview/tests.json`, JSON.stringify(tests, null, 2));
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
