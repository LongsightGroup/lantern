import { assertEquals, assertThrows } from '@std/assert';
import {
  formatStructuredWorkspaceHarnessResultContract,
  parseStructuredWorkspaceHarnessResult,
} from './workspace_harness_result.ts';

Deno.test('structured workspace harness prompt contract parses as the same result shape', () => {
  const parsed = parseStructuredWorkspaceHarnessResult(
    JSON.parse(
      formatStructuredWorkspaceHarnessResultContract({
        progressStage: 'building_package',
      }),
    ) as unknown,
    'workspaceHarnessContract',
  );

  assertEquals(parsed.files[0]?.path, 'relative/path.ext');
  assertEquals(parsed.progressUpdates[0]?.stage, 'building_package');
  assertEquals(parsed.validationFindings[0]?.severity, 'error');
});

Deno.test('structured workspace harness result rejects duplicate file paths', () => {
  assertThrows(
    () =>
      parseStructuredWorkspaceHarnessResult(
        {
          files: [
            {
              path: 'manifest.json',
              contents: '{}\n',
              role: 'package',
            },
            {
              path: 'manifest.json',
              contents: '{"duplicate":true}\n',
              role: 'package',
            },
          ],
          progressUpdates: [],
          notes: [],
          validationFindings: [],
        },
        'workspaceHarnessModelResult',
      ),
    TypeError,
    'workspaceHarnessModelResult.files[1].path duplicates workspaceHarnessModelResult.files[0].path.',
  );
});
