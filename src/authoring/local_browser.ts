import { Browser, computeExecutablePath, install } from '@puppeteer/browsers';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser as PreviewBrowser } from 'puppeteer-core';
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js';

// Use explicit pinned configuration. The convenience Puppeteer package searches
// for executable config files relative to cwd, which may be an untrusted app.
const cacheDir = process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), '.cache', 'puppeteer');
const browserOptions = {
  browser: Browser.CHROME,
  buildId: PUPPETEER_REVISIONS.chrome,
  cacheDir,
};

/** Install the exact Chrome revision used by the local preview runner. */
export async function installLocalPreviewBrowser(): Promise<void> {
  await install(browserOptions);
}

/** Launch a fresh sandboxed Chrome instance without host environment or app config. */
export async function launchLocalPreviewBrowser(): Promise<PreviewBrowser> {
  return await puppeteer.launch({
    executablePath: computeExecutablePath(browserOptions),
    env: {},
    pipe: true,
    ignoreDefaultArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}
