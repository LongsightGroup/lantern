import { assertEquals } from '@std/assert';
import { createLocalAppPackagePreviewer } from './preview.ts';
import {
  buildValidBrowserAutograderFiles,
  buildValidSimpleActivityFiles,
} from '../test_helpers/app_writer_generated_package.ts';

Deno.test({
  name: 'local app package previewer accepts a package that boots and passes assertions',
  permissions: previewPermissions(),
  async fn() {
    const result = await createLocalAppPackagePreviewer({
      settleTimeoutMs: 250,
    }).preview({
      generationId: 'generation-1',
      selectedStarterId: 'simple-activity',
      files: buildValidSimpleActivityFiles(),
    });

    assertEquals(result.validationFindings, []);
    assertEquals(result.assertionCount, 1);
    assertEquals(result.passedAssertionCount, 1);
  },
});

Deno.test({
  name: 'local app package previewer returns structured assertion failures',
  permissions: previewPermissions(),
  async fn() {
    const files = buildValidSimpleActivityFiles().map((file) =>
      file.path === 'preview/tests.json'
        ? {
          ...file,
          contents: JSON.stringify([
            {
              name: 'missing title',
              assert: {
                selector: '[data-test="missing-title"]',
                text: 'Phonics Match',
              },
            },
          ]),
        }
        : file
    );

    const result = await createLocalAppPackagePreviewer({
      settleTimeoutMs: 250,
    }).preview({
      generationId: 'generation-1',
      selectedStarterId: 'simple-activity',
      files,
    });

    assertEquals(result.validationFindings[0]?.code, 'preview_assertion_failed');
    assertEquals(result.validationFindings[0]?.file, '/preview/tests.json');
    assertEquals(result.assertionCount, 1);
    assertEquals(result.passedAssertionCount, 0);
  },
});

Deno.test({
  name: 'local app package previewer runs the browser autograder path',
  permissions: previewPermissions(),
  async fn() {
    const result = await createLocalAppPackagePreviewer({
      settleTimeoutMs: 500,
    }).preview({
      generationId: 'generation-1',
      selectedStarterId: 'browser-autograder',
      files: buildValidBrowserAutograderFiles(),
    });

    assertEquals(result.validationFindings, []);
    assertEquals(result.assertionCount, 2);
  },
});

function previewPermissions(): Deno.PermissionOptions {
  return {
    env: ['WS_NO_BUFFER_UTIL', 'WS_NO_UTF_8_VALIDATE'],
    net: ['127.0.0.1'],
    read: true,
    write: true,
  };
}
