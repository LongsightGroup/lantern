import puppeteer from '@cloudflare/puppeteer';
import {
  type LocalAppPackage,
  type LocalAppValidationResult,
  type LocalPreviewTest,
  validateLocalAppPackageSource,
} from '../authoring/local_app.ts';
import {
  createLocalPreviewHarness,
  type LocalPreviewLogEntry,
} from '../authoring/local_preview.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type {
  AppGenerationValidationFinding,
  AppPackagePreviewer,
  AppPackagePreviewResult,
} from './types.ts';

const PREVIEW_ORIGIN = 'https://lantern-preview.local';
const DEFAULT_NAVIGATION_TIMEOUT_MS = 10_000;
const DEFAULT_ASSERTION_TIMEOUT_MS = 5_000;
const MAX_RUNTIME_DETAILS = 8;

type CloudflareBrowserBinding = Parameters<typeof puppeteer.launch>[0];

export interface BrowserPreviewAutomation {
  launch(binding: unknown): Promise<BrowserPreviewBrowser>;
}

export interface BrowserPreviewBrowser {
  newPage(): Promise<BrowserPreviewPage>;
  close(): Promise<void>;
}

export interface BrowserPreviewPage {
  setRequestInterception(enabled: boolean): Promise<void>;
  on(
    event: 'request' | 'pageerror' | 'error' | 'console',
    handler:
      | ((request: BrowserPreviewRequest) => void)
      | ((error: unknown) => void)
      | ((message: BrowserPreviewConsoleMessage) => void),
  ): void;
  goto(
    url: string,
    options: {
      waitUntil: 'networkidle0';
      timeout: number;
    },
  ): Promise<unknown>;
  waitForSelector(
    selector: string,
    options: {
      timeout: number;
    },
  ): Promise<unknown>;
  $eval<T>(selector: string, pageFunction: (element: BrowserPreviewElement) => T): Promise<T>;
}

export interface BrowserPreviewElement {
  textContent: string | null;
}

export interface BrowserPreviewRequest {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
  postData(): string | undefined;
  respond(response: BrowserPreviewResponse): Promise<void>;
  abort(): Promise<void>;
}

export interface BrowserPreviewConsoleMessage {
  type(): string;
  text(): string;
}

export interface BrowserPreviewResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Uint8Array;
}

export function createCloudflareBrowserAppPackagePreviewer(input: {
  browser: unknown;
  automation?: BrowserPreviewAutomation;
  navigationTimeoutMs?: number;
  assertionTimeoutMs?: number;
}): AppPackagePreviewer {
  const automation = input.automation ?? createDefaultBrowserAutomation();
  const navigationTimeoutMs = input.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
  const assertionTimeoutMs = input.assertionTimeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS;

  return {
    async preview(previewInput) {
      const source = createMemoryPackageSource(
        previewInput.files.map((file) => ({
          relativePath: file.path,
          bytes: file.contents,
        })),
      );
      const packageRoot = `memory://app-writer/${previewInput.generationId}`;
      const validation = await validateLocalAppPackageSource(source, packageRoot);

      if (!validation.ok || !validation.appPackage) {
        return mapValidationFailure(validation);
      }

      return await runBrowserPreview({
        browserBinding: input.browser,
        automation,
        appPackage: validation.appPackage,
        navigationTimeoutMs,
        assertionTimeoutMs,
      });
    },
  };
}

function createDefaultBrowserAutomation(): BrowserPreviewAutomation {
  return {
    async launch(binding) {
      return (await puppeteer.launch(
        binding as CloudflareBrowserBinding,
      )) as unknown as BrowserPreviewBrowser;
    },
  };
}

async function runBrowserPreview(input: {
  browserBinding: unknown;
  automation: BrowserPreviewAutomation;
  appPackage: LocalAppPackage;
  navigationTimeoutMs: number;
  assertionTimeoutMs: number;
}): Promise<AppPackagePreviewResult> {
  const runtimeLog: LocalPreviewLogEntry[] = [];
  const runtimeErrors: string[] = [];
  const harness = createLocalPreviewHarness({
    appPackage: input.appPackage,
    logger(entry) {
      runtimeLog.push(entry);
    },
  });
  const entrypointUrl = `${PREVIEW_ORIGIN}${harness.entrypointPath}`;
  const browser = await input.automation.launch(input.browserBinding);

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request: BrowserPreviewRequest) => {
      void respondToPreviewRequest({
        request,
        harness,
      }).catch((error) => {
        runtimeErrors.push(formatUnknownError(error));
        void request.abort();
      });
    });
    page.on('pageerror', (error: unknown) => {
      runtimeErrors.push(formatUnknownError(error));
    });
    page.on('error', (error: unknown) => {
      runtimeErrors.push(formatUnknownError(error));
    });
    page.on('console', (message: BrowserPreviewConsoleMessage) => {
      if (message.type() === 'error') {
        runtimeErrors.push(message.text());
      }
    });

    await page.goto(entrypointUrl, {
      waitUntil: 'networkidle0',
      timeout: input.navigationTimeoutMs,
    });

    const results = await evaluateBrowserPreviewAssertions(
      page,
      input.appPackage.previewTests,
      input.assertionTimeoutMs,
    );
    const failedCount = results.filter((result) => !result.passed).length;

    if (runtimeErrors.length > 0) {
      return mapRuntimeFailure(runtimeErrors, runtimeLog);
    }

    const validationFindings = results.flatMap((assertion) => {
      if (assertion.passed) {
        return [];
      }

      return [mapAssertionFailure(assertion)];
    });

    return {
      validationFindings,
      assertionCount: results.length,
      passedAssertionCount: results.length - failedCount,
      runtimeLog: runtimeLog.map(mapRuntimeLogEntry),
      summary:
        failedCount === 0
          ? `Passed ${results.length}/${results.length} preview assertions in Cloudflare Browser Rendering.`
          : `Failed ${failedCount}/${results.length} preview assertions in Cloudflare Browser Rendering.`,
    };
  } catch (error) {
    return mapRuntimeFailure([formatUnknownError(error), ...runtimeErrors], runtimeLog);
  } finally {
    await browser.close();
  }
}

async function respondToPreviewRequest(input: {
  request: BrowserPreviewRequest;
  harness: ReturnType<typeof createLocalPreviewHarness>;
}): Promise<void> {
  const url = new URL(input.request.url());

  if (url.origin !== PREVIEW_ORIGIN) {
    await input.request.respond({
      status: 502,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
      body: 'Lantern preview blocks external network requests.',
    });
    return;
  }

  if (url.pathname === '/favicon.ico') {
    await input.request.respond({
      status: 204,
      headers: {},
      body: '',
    });
    return;
  }

  const response = await input.harness.handle(
    new Request(url.toString(), buildPreviewRequestInit(input.request)),
  );
  const body = new Uint8Array(await response.arrayBuffer());
  await input.request.respond({
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  });
}

function buildPreviewRequestInit(request: BrowserPreviewRequest): RequestInit {
  const method = request.method();
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers())) {
    const normalizedName = name.toLowerCase();

    if (normalizedName !== 'host' && normalizedName !== 'content-length') {
      headers.set(name, value);
    }
  }

  const body = request.postData();

  return {
    method,
    headers,
    ...(body === undefined || method === 'GET' || method === 'HEAD' ? {} : { body }),
  };
}

interface BrowserPreviewAssertionResult {
  name: string;
  selector: string;
  passed: boolean;
  code: 'passed' | 'selector_not_found' | 'text_mismatch' | 'contains_mismatch';
  message: string;
  actualText?: string;
}

async function evaluateBrowserPreviewAssertions(
  page: BrowserPreviewPage,
  tests: readonly LocalPreviewTest[],
  assertionTimeoutMs: number,
): Promise<BrowserPreviewAssertionResult[]> {
  const results: BrowserPreviewAssertionResult[] = [];

  for (const test of tests) {
    results.push(await evaluateBrowserPreviewAssertion(page, test, assertionTimeoutMs));
  }

  return results;
}

async function evaluateBrowserPreviewAssertion(
  page: BrowserPreviewPage,
  test: LocalPreviewTest,
  assertionTimeoutMs: number,
): Promise<BrowserPreviewAssertionResult> {
  const selector = test.assert.selector;

  try {
    await page.waitForSelector(selector, { timeout: assertionTimeoutMs });
  } catch {
    return {
      name: test.name,
      selector,
      passed: false,
      code: 'selector_not_found',
      message: `Selector ${selector} was not found in the preview DOM.`,
    };
  }

  const actualText = normalizeAssertionText(
    await page.$eval(selector, (element) => element.textContent ?? ''),
  );

  if (test.assert.text !== undefined) {
    const expectedText = normalizeAssertionText(test.assert.text);

    if (actualText !== expectedText) {
      return {
        name: test.name,
        selector,
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
    passed: true,
    code: 'passed',
    message: `Selector ${selector} satisfied the preview assertion.`,
    ...(actualText === '' ? {} : { actualText }),
  };
}

function mapValidationFailure(validation: LocalAppValidationResult): AppPackagePreviewResult {
  return {
    validationFindings: validation.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: 'error',
      message: diagnostic.message,
      file: diagnostic.file ?? null,
      field: diagnostic.field ?? null,
      fix: diagnostic.fix,
      detail: {},
    })),
    assertionCount: 0,
    passedAssertionCount: 0,
    runtimeLog: [],
    summary: `Preview package validation failed with ${validation.diagnostics.length} diagnostics.`,
  };
}

function mapRuntimeFailure(
  details: readonly string[],
  runtimeLog: readonly LocalPreviewLogEntry[],
): AppPackagePreviewResult {
  const boundedDetails = details
    .map((detail) => detail.trim())
    .filter((detail) => detail !== '')
    .slice(0, MAX_RUNTIME_DETAILS);
  const message = boundedDetails.at(0) ?? 'Cloudflare Browser Rendering preview failed.';

  return {
    validationFindings: [
      {
        code: 'preview_runtime_failed',
        severity: 'error',
        message,
        file: null,
        field: null,
        fix: 'Fix the generated browser code so it boots in Lantern preview without runtime errors.',
        detail: {
          details: boundedDetails,
        },
      },
    ],
    assertionCount: 0,
    passedAssertionCount: 0,
    runtimeLog: runtimeLog.map(mapRuntimeLogEntry),
    summary: 'Preview runtime failed before assertions completed.',
  };
}

function mapAssertionFailure(
  assertion: BrowserPreviewAssertionResult,
): AppGenerationValidationFinding {
  return {
    code: 'preview_assertion_failed',
    severity: 'error',
    message: assertion.message,
    file: '/preview/tests.json',
    field: null,
    fix: 'Update the generated app UI or preview assertion so the reviewed preview passes.',
    detail: {
      name: assertion.name,
      selector: assertion.selector,
      assertionCode: assertion.code,
      actualText: assertion.actualText ?? null,
    },
  };
}

function mapRuntimeLogEntry(
  entry: LocalPreviewLogEntry,
): AppPackagePreviewResult['runtimeLog'][number] {
  return {
    level: 'info',
    message: entry.eventType.replaceAll('.', ' '),
    detail: {
      ...entry.detail,
      occurredAt: entry.occurredAt,
    },
  };
}

function normalizeAssertionText(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function formatUnknownError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  return 'Unknown preview runtime error.';
}
