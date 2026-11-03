import type { HTTPRequest } from 'puppeteer-core';
import { launchLocalPreviewBrowser } from './local_browser.ts';
import {
  type LocalAppPackage,
  type LocalAppValidationDiagnostic,
  type LocalAppValidationResult,
  type LocalPreviewTest,
  validateLocalAppPackage,
  validateLocalAppPackageSource,
} from './local_app.ts';
import { createLocalPreviewHarness, type LocalPreviewLogEntry } from './local_preview.ts';
import type { PackageSource } from '../package_review/package_source.ts';

const DEFAULT_SETTLE_TIMEOUT_MS = 1_000;
const PREVIEW_ORIGIN = 'https://lantern-preview.local';

export type LocalPreviewAssertionFailureCode =
  | 'selector_not_found'
  | 'text_mismatch'
  | 'contains_mismatch';

export type LocalPreviewAssertionExpectation =
  | { kind: 'exists' }
  | { kind: 'text'; value: string }
  | { kind: 'contains'; value: string };

export interface LocalPreviewAssertionResult {
  name: string;
  selector: string;
  expectation: LocalPreviewAssertionExpectation;
  passed: boolean;
  code: 'passed' | LocalPreviewAssertionFailureCode;
  message: string;
  actualText?: string;
}

export interface SuccessfulLocalPreviewAssertionRun {
  ok: true;
  packageRoot: string;
  results: LocalPreviewAssertionResult[];
  passedCount: number;
  failedCount: number;
  runtimeLog: LocalPreviewLogEntry[];
}

export interface FailedLocalPreviewAssertionValidationRun {
  ok: false;
  kind: 'validation_failed';
  packageRoot: string;
  diagnostics: LocalAppValidationDiagnostic[];
  issues: string[];
  warnings: string[];
}

export interface FailedLocalPreviewAssertionRuntimeRun {
  ok: false;
  kind: 'runtime_failed';
  packageRoot: string;
  message: string;
  details: string[];
  runtimeLog: LocalPreviewLogEntry[];
}

export type LocalPreviewAssertionRunResult =
  | SuccessfulLocalPreviewAssertionRun
  | FailedLocalPreviewAssertionValidationRun
  | FailedLocalPreviewAssertionRuntimeRun;

export async function runLocalPreviewAssertions(
  packageRoot: string,
  input: {
    settleTimeoutMs?: number;
  } = {},
): Promise<LocalPreviewAssertionRunResult> {
  const validation = await validateLocalAppPackage(packageRoot);

  if (!validation.ok || !validation.appPackage) {
    return buildValidationFailure(packageRoot, validation);
  }

  const result = await runLocalPreviewAssertionsForPackage(validation.appPackage, input);

  return {
    packageRoot,
    ...result,
  };
}

export async function runLocalPreviewAssertionsForSource(
  source: PackageSource,
  input: {
    packageRoot?: string;
    settleTimeoutMs?: number;
  } = {},
): Promise<LocalPreviewAssertionRunResult> {
  const packageRoot = input.packageRoot ?? 'memory://lantern-preview-package';
  const validation = await validateLocalAppPackageSource(source, packageRoot);

  if (!validation.ok || !validation.appPackage) {
    return buildValidationFailure(packageRoot, validation);
  }

  const result = await runLocalPreviewAssertionsForPackage(validation.appPackage, input);

  return {
    packageRoot,
    ...result,
  };
}

export async function runLocalPreviewAssertionsForPackage(
  appPackage: LocalAppPackage,
  input: {
    settleTimeoutMs?: number;
  } = {},
): Promise<
  | Omit<SuccessfulLocalPreviewAssertionRun, 'packageRoot'>
  | Omit<FailedLocalPreviewAssertionRuntimeRun, 'packageRoot'>
> {
  const runtimeLog: LocalPreviewLogEntry[] = [];
  let failureMessage =
    'Chrome could not start. Run npm run browser:install and check that Chrome sandboxing is available.';
  try {
    // Generated code runs only in Chrome's sandboxed renderer. No Node objects or
    // host functions are exposed to the page; the gateway stays in this process.
    const browser = await launchLocalPreviewBrowser();
    try {
      failureMessage = 'The local preview browser could not create a page.';
      const page = await browser.newPage();
      const runtimeErrors: string[] = [];
      const harness = createLocalPreviewHarness({
        appPackage,
        logger(entry) {
          runtimeLog.push(entry);
        },
      });
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        void respondToPreviewRequest(request, harness).catch(async () => {
          runtimeErrors.push('Lantern could not serve a preview request.');
          await request.abort().catch(() => {});
        });
      });
      page.on('pageerror', () => {
        runtimeErrors.push('The preview reported a JavaScript runtime error.');
      });
      page.on('error', () => {
        runtimeErrors.push('The preview browser page crashed.');
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          runtimeErrors.push('The preview reported a browser console error.');
        }
      });
      failureMessage = 'The preview page failed to load within 10 seconds.';
      await page.goto(`${PREVIEW_ORIGIN}${harness.entrypointPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });
      failureMessage = `The preview did not settle within ${input.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS}ms.`;
      await page.waitForNetworkIdle({
        idleTime: 60,
        timeout: input.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS,
      });
      if (runtimeErrors.length > 0) {
        return {
          ok: false,
          kind: 'runtime_failed',
          message: runtimeErrors[0] ?? 'The preview runtime failed.',
          details: runtimeErrors,
          runtimeLog,
        };
      }
      failureMessage = 'The browser could not evaluate the preview assertions.';
      const results: LocalPreviewAssertionResult[] = [];
      for (const test of appPackage.previewTests) {
        const element = await page.$(test.assert.selector);
        const actualText = element
          ? await element.evaluate((node) => node.textContent ?? '')
          : null;
        await element?.dispose();
        results.push(evaluatePreviewAssertion(actualText, test));
      }
      const failedCount = results.filter((result) => !result.passed).length;
      return {
        ok: true,
        results,
        passedCount: results.length - failedCount,
        failedCount,
        runtimeLog,
      };
    } finally {
      await browser.close();
    }
  } catch {
    // Browser errors can contain app-controlled text. Keep host diagnostics and
    // package output out of this structured failure, including missing-browser errors.
    return {
      ok: false,
      kind: 'runtime_failed',
      message: failureMessage,
      details: [],
      runtimeLog,
    };
  }
}

async function respondToPreviewRequest(
  request: HTTPRequest,
  harness: ReturnType<typeof createLocalPreviewHarness>,
): Promise<void> {
  const url = new URL(request.url());
  if (url.origin !== PREVIEW_ORIGIN) {
    await request.abort('blockedbyclient');
    return;
  }
  if (url.pathname === '/favicon.ico') {
    await request.respond({ status: 204 });
    return;
  }
  const method = request.method();
  const body = request.postData();
  const response = await harness.handle(
    new Request(url, {
      method,
      headers: request.headers(),
      ...(body === undefined || method === 'GET' || method === 'HEAD' ? {} : { body }),
    }),
  );
  await request.respond({
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'connection-allowlist': '(response-origin)',
      'content-security-policy':
        "default-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    },
    body: new Uint8Array(await response.arrayBuffer()),
  });
}

function buildValidationFailure(
  packageRoot: string,
  validation: LocalAppValidationResult,
): FailedLocalPreviewAssertionValidationRun {
  return {
    ok: false,
    kind: 'validation_failed',
    packageRoot,
    diagnostics: validation.diagnostics,
    issues: validation.issues,
    warnings: validation.warnings,
  };
}

function evaluatePreviewAssertion(
  textContent: string | null,
  test: LocalPreviewTest,
): LocalPreviewAssertionResult {
  const selector = test.assert.selector;
  const expectation = describeExpectation(test);

  if (textContent === null) {
    return {
      name: test.name,
      selector,
      expectation,
      passed: false,
      code: 'selector_not_found',
      message: `Selector ${selector} was not found in the preview DOM.`,
    };
  }

  const actualText = normalizeAssertionText(textContent);

  if (test.assert.text !== undefined) {
    const expectedText = normalizeAssertionText(test.assert.text);

    if (actualText !== expectedText) {
      return {
        name: test.name,
        selector,
        expectation,
        passed: false,
        code: 'text_mismatch',
        message: `Expected exact text "${expectedText}" for ${selector} but found "${actualText}".`,
        actualText,
      };
    }
  }

  if (test.assert.contains !== undefined) {
    const expectedContains = normalizeAssertionText(test.assert.contains);

    if (!actualText.includes(expectedContains)) {
      return {
        name: test.name,
        selector,
        expectation,
        passed: false,
        code: 'contains_mismatch',
        message: `Expected ${selector} to contain "${expectedContains}" but found "${actualText}".`,
        actualText,
      };
    }
  }

  return {
    name: test.name,
    selector,
    expectation,
    passed: true,
    code: 'passed',
    message: `Selector ${selector} satisfied the preview assertion.`,
    ...(actualText === '' ? {} : { actualText }),
  };
}

function describeExpectation(test: LocalPreviewTest): LocalPreviewAssertionExpectation {
  if (test.assert.text !== undefined) {
    return {
      kind: 'text',
      value: normalizeAssertionText(test.assert.text),
    };
  }

  if (test.assert.contains !== undefined) {
    return {
      kind: 'contains',
      value: normalizeAssertionText(test.assert.contains),
    };
  }

  return {
    kind: 'exists',
  };
}

function normalizeAssertionText(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}
