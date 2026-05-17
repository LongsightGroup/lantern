import { assertEquals } from '@std/assert';
import {
  type BrowserPreviewAutomation,
  type BrowserPreviewBrowser,
  type BrowserPreviewConsoleMessage,
  type BrowserPreviewElement,
  type BrowserPreviewPage,
  type BrowserPreviewRequest,
  type BrowserPreviewResponse,
  createCloudflareBrowserAppPackagePreviewer,
} from './cloudflare_browser_preview.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';

Deno.test('Cloudflare Browser previewer returns structured assertion success', async () => {
  const automation = createFakeBrowserAutomation(
    new Map([['[data-test="app-title"]', 'Phonics Match']]),
  );
  const result = await createCloudflareBrowserAppPackagePreviewer({
    browser: {},
    automation,
  }).preview({
    generationId: 'generation-browser-preview',
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
  });

  assertEquals(automation.launchCount, 1);
  assertEquals(result.validationFindings, []);
  assertEquals(result.assertionCount, 1);
  assertEquals(result.passedAssertionCount, 1);
  assertEquals(result.summary, 'Passed 1/1 preview assertions in Cloudflare Browser Rendering.');
});

Deno.test('Cloudflare Browser previewer maps missing selectors to preview findings', async () => {
  const result = await createCloudflareBrowserAppPackagePreviewer({
    browser: {},
    automation: createFakeBrowserAutomation(new Map()),
    assertionTimeoutMs: 1,
  }).preview({
    generationId: 'generation-browser-preview',
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
  });

  assertEquals(result.validationFindings[0]?.code, 'preview_assertion_failed');
  assertEquals(result.validationFindings[0]?.file, '/preview/tests.json');
  assertEquals(result.assertionCount, 1);
  assertEquals(result.passedAssertionCount, 0);
});

Deno.test('Cloudflare Browser previewer validates the package before launching Chromium', async () => {
  const automation = createFakeBrowserAutomation(new Map());
  const files = buildValidSimpleActivityFiles().filter((file) => file.path !== 'manifest.json');
  const result = await createCloudflareBrowserAppPackagePreviewer({
    browser: {},
    automation,
  }).preview({
    generationId: 'generation-browser-preview',
    selectedStarterId: 'simple-activity',
    files,
  });

  assertEquals(automation.launchCount, 0);
  assertEquals(result.validationFindings[0]?.code, 'missing_file');
  assertEquals(result.assertionCount, 0);
});

interface FakeBrowserAutomation extends BrowserPreviewAutomation {
  readonly launchCount: number;
}

function createFakeBrowserAutomation(
  selectorText: ReadonlyMap<string, string>,
): FakeBrowserAutomation {
  let launchCount = 0;

  return {
    get launchCount() {
      return launchCount;
    },
    launch(_binding: unknown): Promise<BrowserPreviewBrowser> {
      launchCount += 1;
      return Promise.resolve(createFakeBrowser(selectorText));
    },
  };
}

function createFakeBrowser(selectorText: ReadonlyMap<string, string>): BrowserPreviewBrowser {
  return {
    newPage(): Promise<BrowserPreviewPage> {
      return Promise.resolve(createFakePage(selectorText));
    },
    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

function createFakePage(selectorText: ReadonlyMap<string, string>): BrowserPreviewPage {
  let requestHandler: ((request: BrowserPreviewRequest) => void) | null = null;

  return {
    setRequestInterception(_enabled: boolean): Promise<void> {
      return Promise.resolve();
    },
    on(
      event: 'request' | 'pageerror' | 'error' | 'console',
      handler:
        | ((request: BrowserPreviewRequest) => void)
        | ((error: unknown) => void)
        | ((message: BrowserPreviewConsoleMessage) => void),
    ): void {
      if (event === 'request') {
        requestHandler = handler as (request: BrowserPreviewRequest) => void;
      }
    },
    async goto(url: string): Promise<unknown> {
      if (requestHandler === null) {
        throw new Error('Request interception was not installed.');
      }

      const request = createFakeRequest(url);
      requestHandler(request);
      const response = await request.responsePromise;

      if (response.status >= 400) {
        throw new Error(`Fake preview request failed with ${response.status}.`);
      }

      return {};
    },
    waitForSelector(selector: string): Promise<unknown> {
      if (!selectorText.has(selector)) {
        return Promise.reject(new Error(`Missing selector ${selector}.`));
      }

      return Promise.resolve({});
    },
    $eval<T>(selector: string, pageFunction: (element: BrowserPreviewElement) => T): Promise<T> {
      const textContent = selectorText.get(selector) ?? '';

      return Promise.resolve(pageFunction({ textContent }));
    },
  };
}

function createFakeRequest(requestUrl: string): BrowserPreviewRequest & {
  responsePromise: Promise<BrowserPreviewResponse>;
} {
  let resolveResponse: ((response: BrowserPreviewResponse) => void) | null = null;
  const responsePromise = new Promise<BrowserPreviewResponse>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    responsePromise,
    url(): string {
      return requestUrl;
    },
    method(): string {
      return 'GET';
    },
    headers(): Record<string, string> {
      return {};
    },
    postData(): string | undefined {
      return undefined;
    },
    respond(response: BrowserPreviewResponse): Promise<void> {
      completeFakeResponse(resolveResponse, response);
      return Promise.resolve();
    },
    abort(): Promise<void> {
      completeFakeResponse(resolveResponse, {
        status: 499,
        headers: {},
        body: 'aborted',
      });
      return Promise.resolve();
    },
  };
}

function completeFakeResponse(
  resolveResponse: ((response: BrowserPreviewResponse) => void) | null,
  response: BrowserPreviewResponse,
): void {
  if (resolveResponse === null) {
    throw new Error('Fake response handler was not initialized.');
  }

  resolveResponse(response);
}
