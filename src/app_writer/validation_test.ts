import { assertEquals } from '@std/assert';
import { validateGeneratedAppPackage } from './validation.ts';
import {
  buildValidBrowserAutograderFiles,
  buildValidSimpleActivityFiles,
} from '../test_helpers/app_writer_generated_package.ts';

Deno.test('generated app validation accepts a minimal simple activity package', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
  });

  assertEquals(findings, []);
});

Deno.test('generated app validation rejects files outside the starter allowlist', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files: [
      ...buildValidSimpleActivityFiles(),
      {
        path: 'server/worker.ts',
        contents: 'export default {};\n',
      },
    ],
  });

  assertEquals(
    findings.some((finding) => finding.code === 'file_path_not_allowed'),
    true,
  );
});

Deno.test('generated app validation rejects external network and storage fallbacks', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'dist/app.js'
      ? {
          ...file,
          contents: `${file.contents}\nfetch("https://example.com");\nlocalStorage.setItem("x", "1");\n`,
        }
      : file,
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'external_network_forbidden'),
    true,
  );
  assertEquals(
    findings.some((finding) => finding.code === 'browser_storage_forbidden'),
    true,
  );
});

Deno.test('generated app validation rejects SDK capability mismatches', async () => {
  const files = buildValidSimpleActivityFiles().map((file) =>
    file.path === 'manifest.json'
      ? {
          ...file,
          contents: file.contents.replace('"submit_attempt_event",', ''),
        }
      : file,
  );
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(
    findings.some((finding) => finding.code === 'sdk_capability_missing'),
    true,
  );
});

Deno.test('generated app validation accepts a browser autograder package shape', async () => {
  const findings = await validateGeneratedAppPackage({
    selectedStarterId: 'browser-autograder',
    files: buildValidBrowserAutograderFiles(),
  });

  assertEquals(findings, []);
});
