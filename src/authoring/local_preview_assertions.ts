import { Browser, type BrowserWindow } from '@happy-dom';
import {
  type LocalAppPackage,
  type LocalAppValidationDiagnostic,
  type LocalAppValidationResult,
  type LocalPreviewTest,
  validateLocalAppPackage,
} from './local_app.ts';
import { createLocalPreviewHarness } from './local_preview.ts';

const DEFAULT_SETTLE_TIMEOUT_MS = 1_000;
const DEFAULT_IDLE_POLL_MS = 20;
const DEFAULT_IDLE_STREAK = 3;

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
}

export type LocalPreviewAssertionRunResult =
  | SuccessfulLocalPreviewAssertionRun
  | FailedLocalPreviewAssertionValidationRun
  | FailedLocalPreviewAssertionRuntimeRun;

interface PreviewRuntimeHandle {
  window: BrowserWindow;
  close(): Promise<void>;
}

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

export async function runLocalPreviewAssertionsForPackage(
  appPackage: LocalAppPackage,
  input: {
    settleTimeoutMs?: number;
  } = {},
): Promise<
  | Omit<SuccessfulLocalPreviewAssertionRun, 'packageRoot'>
  | Omit<FailedLocalPreviewAssertionRuntimeRun, 'packageRoot'>
> {
  const runtime = await loadPreviewRuntime(appPackage, input);

  try {
    const results = evaluatePreviewAssertions(runtime.window.document, appPackage.previewTests);
    const failedCount = results.filter((result) => !result.passed).length;

    return {
      ok: true,
      results,
      passedCount: results.length - failedCount,
      failedCount,
    };
  } catch (error) {
    return {
      ok: false,
      kind: 'runtime_failed',
      message: error instanceof Error ? error.message : 'Lantern preview assertion runtime failed.',
      details: [],
    };
  } finally {
    await runtime.close();
  }
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

async function loadPreviewRuntime(
  appPackage: LocalAppPackage,
  input: {
    settleTimeoutMs?: number;
  },
): Promise<PreviewRuntimeHandle> {
  const harness = createLocalPreviewHarness({
    appPackage,
  });
  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen() {},
    },
    (request) => harness.handle(request),
  );
  const address = server.addr as Deno.NetAddr;
  const origin = `http://${address.hostname}:${address.port}`;
  const entrypointUrl = `${origin}${harness.entrypointPath}`;
  const browser = new Browser({
    settings: {
      disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
    },
  });
  const page = browser.newPage();

  try {
    await page.goto(entrypointUrl);
    await page.waitUntilComplete();

    const frame = page.frames[0];

    if (!frame) {
      throw new Error('Lantern preview assertion runner could not load the preview frame.');
    }

    const runtimeErrors: string[] = [];
    attachRuntimeErrorCapture(frame.window, runtimeErrors);
    installControlledScriptLoader(frame.window, entrypointUrl);
    const pendingFetches = trackWindowFetch(frame.window);

    await executePreviewScripts(frame.window, entrypointUrl);
    await waitForPreviewIdle({
      runtimeErrors,
      pendingFetches,
      settleTimeoutMs: input.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS,
    });

    if (runtimeErrors.length > 0) {
      throw new Error(runtimeErrors.join(' | '));
    }

    return {
      window: frame.window,
      async close() {
        await browser.close();
        await server.shutdown();
      },
    };
  } catch (error) {
    await browser.close();
    await server.shutdown();
    throw error;
  }
}

function installControlledScriptLoader(window: BrowserWindow, entrypointUrl: string): void {
  const allowedOrigin = new URL(entrypointUrl).origin;
  const originalAppendChild = window.Node.prototype.appendChild;

  window.Node.prototype.appendChild = function (
    this: InstanceType<BrowserWindow['Node']>,
    node: InstanceType<BrowserWindow['Node']>,
  ): InstanceType<BrowserWindow['Node']> {
    if (isWindowScriptElement(window, node) && node.src.trim() !== '') {
      void loadControlledScript(window, node, allowedOrigin);

      return node;
    }

    return originalAppendChild.call(this, node) as InstanceType<BrowserWindow['Node']>;
  };
}

async function loadControlledScript(
  window: BrowserWindow,
  element: InstanceType<BrowserWindow['HTMLScriptElement']>,
  allowedOrigin: string,
): Promise<void> {
  try {
    const scriptUrl = new URL(element.src, window.location.href);

    if (scriptUrl.origin !== allowedOrigin) {
      throw new Error(
        `Preview dynamic script ${scriptUrl.toString()} is outside the preview origin.`,
      );
    }

    const response = await fetch(scriptUrl);

    if (!response.ok) {
      throw new Error(
        `Preview dynamic script request failed for ${scriptUrl.toString()} with status ${response.status}.`,
      );
    }

    const source = await response.text();

    evaluateDynamicScript(window, element, source, scriptUrl.toString());
    element.dispatchEvent(new window.Event('load'));
  } catch {
    element.dispatchEvent(new window.Event('error'));
  }
}

function evaluateDynamicScript(
  window: BrowserWindow,
  element: InstanceType<BrowserWindow['HTMLScriptElement']>,
  source: string,
  sourceUrl: string,
): void {
  const originalCurrentScript = Object.getOwnPropertyDescriptor(window.document, 'currentScript');
  const windowRecord = window as unknown as Record<string, unknown>;
  const originalLanternCurrentScript = windowRecord.__LanternCurrentScript;

  Object.defineProperty(window.document, 'currentScript', {
    configurable: true,
    get() {
      return element;
    },
  });
  windowRecord.__LanternCurrentScript = element;

  try {
    window.eval(`${source}\n//# sourceURL=${sourceUrl}`);
  } finally {
    if (originalLanternCurrentScript === undefined) {
      delete windowRecord.__LanternCurrentScript;
    } else {
      windowRecord.__LanternCurrentScript = originalLanternCurrentScript;
    }

    if (originalCurrentScript === undefined) {
      delete (window.document as unknown as Record<string, unknown>).currentScript;
    } else {
      Object.defineProperty(window.document, 'currentScript', originalCurrentScript);
    }
  }
}

function isWindowScriptElement(
  window: BrowserWindow,
  value: unknown,
): value is InstanceType<BrowserWindow['HTMLScriptElement']> {
  return value instanceof window.HTMLScriptElement;
}

function attachRuntimeErrorCapture(window: BrowserWindow, runtimeErrors: string[]): void {
  window.addEventListener('error', (event) => {
    const errorEvent = event as unknown as {
      error?: unknown;
      message?: string;
    };

    runtimeErrors.push(
      formatUnknownError(errorEvent.error ?? errorEvent.message ?? 'Unknown runtime error.'),
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    const rejectionEvent = event as unknown as {
      reason?: unknown;
      preventDefault(): void;
    };

    runtimeErrors.push(formatUnknownError(rejectionEvent.reason ?? 'Unknown rejected promise.'));
    rejectionEvent.preventDefault();
  });
}

function trackWindowFetch(window: BrowserWindow): () => number {
  type WindowFetch = BrowserWindow['fetch'];

  const originalFetch = window.fetch.bind(window) as WindowFetch;
  let pendingFetches = 0;

  const wrappedFetch: WindowFetch = async (...args) => {
    pendingFetches += 1;

    try {
      return await originalFetch(...args);
    } finally {
      pendingFetches -= 1;
    }
  };
  window.fetch = wrappedFetch;

  return () => pendingFetches;
}

async function executePreviewScripts(window: BrowserWindow, entrypointUrl: string): Promise<void> {
  const scripts = [...window.document.querySelectorAll('script')];

  for (const [index, script] of scripts.entries()) {
    const type = script.getAttribute('type')?.trim() ?? '';

    if (!isSupportedPreviewScriptType(type)) {
      throw new Error(
        `Preview assertion runner only supports classic script tags. Unsupported script type "${type}" found in ${entrypointUrl}.`,
      );
    }

    const scriptSource = script.getAttribute('src');

    if (!scriptSource) {
      const source = script.textContent ?? '';

      if (source.trim() === '') {
        continue;
      }

      window.eval(`${source}\n//# sourceURL=${entrypointUrl}#inline-${index}`);
      continue;
    }

    const scriptUrl = new URL(scriptSource, entrypointUrl).toString();
    const response = await fetch(scriptUrl);

    if (!response.ok) {
      throw new Error(
        `Preview script request failed for ${scriptUrl} with status ${response.status}.`,
      );
    }

    const source = await response.text();

    window.eval(`${source}\n//# sourceURL=${scriptUrl}`);
  }
}

function isSupportedPreviewScriptType(type: string): boolean {
  return type === '' || type === 'text/javascript' || type === 'application/javascript';
}

async function waitForPreviewIdle(input: {
  runtimeErrors: string[];
  pendingFetches: () => number;
  settleTimeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + input.settleTimeoutMs;
  let idleStreak = 0;

  while (Date.now() <= deadline) {
    if (input.pendingFetches() === 0) {
      idleStreak += 1;
    } else {
      idleStreak = 0;
    }

    if (idleStreak >= DEFAULT_IDLE_STREAK) {
      await sleep(DEFAULT_IDLE_POLL_MS);

      if (input.runtimeErrors.length > 0) {
        throw new Error(input.runtimeErrors.join(' | '));
      }

      return;
    }

    if (input.runtimeErrors.length > 0 && input.pendingFetches() === 0) {
      throw new Error(input.runtimeErrors.join(' | '));
    }

    await sleep(DEFAULT_IDLE_POLL_MS);
  }

  if (input.runtimeErrors.length > 0) {
    throw new Error(input.runtimeErrors.join(' | '));
  }

  throw new Error(
    `Lantern preview assertion runner timed out after ${input.settleTimeoutMs}ms waiting for the preview to settle.`,
  );
}

function evaluatePreviewAssertions(
  document: BrowserWindow['document'],
  tests: readonly LocalPreviewTest[],
): LocalPreviewAssertionResult[] {
  return tests.map((test) => evaluatePreviewAssertion(document, test));
}

function evaluatePreviewAssertion(
  document: BrowserWindow['document'],
  test: LocalPreviewTest,
): LocalPreviewAssertionResult {
  const selector = test.assert.selector;
  const element = document.querySelector(selector);
  const expectation = describeExpectation(test);

  if (!element) {
    return {
      name: test.name,
      selector,
      expectation,
      passed: false,
      code: 'selector_not_found',
      message: `Selector ${selector} was not found in the preview DOM.`,
    };
  }

  const actualText = normalizeAssertionText(element.textContent ?? '');

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

function formatUnknownError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  return 'Unknown runtime error.';
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
