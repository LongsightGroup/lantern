import { assertEquals, assertMatch, assertStringIncludes } from '@std/assert';
import {
  createLocalDevRequestHandler,
  loadLocalDevState,
  renderLocalDevStateSummary,
} from './local_dev.ts';

const TEMPLATE_APP_ROOT = 'examples/apps/template';

Deno.test('loadLocalDevState returns a valid preview state for the template app', async () => {
  const state = await loadLocalDevState(TEMPLATE_APP_ROOT);

  assertEquals(state.kind, 'valid');

  if (state.kind !== 'valid') {
    throw new Error('Expected a valid local dev state.');
  }

  assertEquals(state.appPackage.reviewData.appId, 'template-app');
  assertEquals(state.previewCheck.kind, 'passed');
});

Deno.test('renderLocalDevStateSummary reports preview check failures without blocking preview', async () => {
  const tempRoot = await cloneTemplateApp();

  try {
    await Deno.writeTextFile(
      `${tempRoot}/preview/tests.json`,
      JSON.stringify(
        [
          {
            name: 'missing title',
            assert: {
              selector: "[data-test='missing-title']",
            },
          },
        ],
        null,
        2,
      ),
    );
    const state = await loadLocalDevState(tempRoot);

    assertEquals(state.kind, 'valid');

    const summary = renderLocalDevStateSummary({
      state,
      baseUrl: 'http://127.0.0.1:8420/',
    });

    assertStringIncludes(summary, 'Lantern authoring dev loop ready.');
    assertStringIncludes(summary, '- Preview checks: failing');
    assertStringIncludes(summary, '- missing title');
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('createLocalDevRequestHandler serves a validation page while package is invalid', async () => {
  const tempRoot = await cloneTemplateApp();

  try {
    await Deno.remove(`${tempRoot}/preview/tests.json`);
    const state = await loadLocalDevState(tempRoot);

    assertEquals(state.kind, 'invalid');

    const handler = createLocalDevRequestHandler({
      getState() {
        return state;
      },
    });
    const response = await handler(new Request('http://localhost/'));
    const body = await response.text();

    assertEquals(response.status, 503);
    assertStringIncludes(body, 'Preview is blocked until the reviewed package validates.');
    assertStringIncludes(body, 'Fix the issues below and save again.');
    assertStringIncludes(body, '/preview/tests.json');
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('createLocalDevRequestHandler delegates to the current preview harness when valid', async () => {
  const state = await loadLocalDevState(TEMPLATE_APP_ROOT);

  assertEquals(state.kind, 'valid');

  const handler = createLocalDevRequestHandler({
    getState() {
      return state;
    },
  });
  const response = await handler(new Request('http://localhost/'));

  assertEquals(response.status, 302);
  assertMatch(response.headers.get('location') ?? '', /\/dist\/index\.html$/);
});

async function cloneTemplateApp(): Promise<string> {
  const tempRoot = await Deno.makeTempDir({
    prefix: 'lantern-local-dev-',
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
