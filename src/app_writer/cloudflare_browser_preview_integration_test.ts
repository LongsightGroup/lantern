import { deepStrictEqual, equal, match, ok } from 'node:assert/strict';
import { env } from 'cloudflare:workers';
import { test } from 'vite-plus/test';
import platformWorker from './platform_worker.ts';
import { expectRecord, expectString } from './binding_result.ts';
import type { AppWriterWorkspaceFile } from './types.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';

test('real Browser Rendering validates assertions and blocks outbound requests', async () => {
  const success = await preview(buildValidSimpleActivityFiles());
  deepStrictEqual(success.validationFindings, []);
  equal(success.assertionCount, 1);
  equal(success.passedAssertionCount, 1);

  const failure = await preview(
    buildValidSimpleActivityFiles().map((file) =>
      file.path === 'preview/tests.json'
        ? {
            ...file,
            contents: JSON.stringify([
              { name: 'missing selector', assert: { selector: '#missing' } },
            ]),
          }
        : file,
    ),
  );
  ok(Array.isArray(failure.validationFindings));
  equal(
    expectRecord(failure.validationFindings[0], 'preview finding').code,
    'preview_assertion_failed',
  );
  equal(failure.passedAssertionCount, 0);

  const blocked = await preview(
    buildValidSimpleActivityFiles().map((file) =>
      file.path === 'dist/app.js'
        ? {
            ...file,
            contents:
              'fetch("https://network-probe.invalid/blocked").then(response => { document.querySelector("[data-test=app-title]").textContent = String(response.status); });',
          }
        : file.path === 'preview/tests.json'
          ? {
              ...file,
              contents: JSON.stringify([
                {
                  name: 'external request denied',
                  assert: { selector: '[data-test="app-title"]', text: '502' },
                },
              ]),
            }
          : file,
    ),
  );
  equal(blocked.passedAssertionCount, 0);
  ok(Array.isArray(blocked.validationFindings));
  equal(blocked.validationFindings.length, 1);
  const blockedFinding = expectRecord(blocked.validationFindings[0], 'blocked preview finding');
  equal(blockedFinding.code, 'preview_runtime_failed');
  const detail = expectRecord(blockedFinding.detail, 'blocked request detail');
  ok(Array.isArray(detail.details));
  match(
    detail.details.map((item) => expectString(item, 'browser error')).join('\n'),
    /blocked by CORS policy/,
  );
  console.log(
    'Real browser preview passed: valid package, failed assertion, and blocked outbound request.',
  );
}, 120_000);

async function preview(files: AppWriterWorkspaceFile[]): Promise<Record<string, unknown>> {
  const response = await platformWorker.fetch(
    new Request('http://localhost/app-writer/preview/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationId: 'browser-preview-check',
        selectedStarterId: 'simple-activity',
        files,
      }),
    }),
    env,
  );
  equal(response.status, 200);
  return expectRecord(await response.json(), 'browser preview response');
}
