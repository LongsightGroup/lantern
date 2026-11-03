import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';

// Miniflare bundles @puppeteer/browsers 2.10.6 (including extract-zip 2.0.1),
// so npm overrides cannot fix it. Replace that embedded module with the audited
// installed dependency, then remove its now-unreachable legacy dependency tree.
// This patch is deliberately bound to one published artifact: upgrades require review.
const require = createRequire(import.meta.url);
const entrypoint = require.resolve('miniflare');
const upstreamHash = '81ea9e0536bc38f4b66a60bf70223cf49c1375dada94aee2aadf79735f0c29bc';
const patchedHash = '4dc1dc33f6a1fbc14d33d5e21d1e370552ff8db4e38f27ab836023622395595b';
const source = await readFile(entrypoint, 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
if (hash === patchedHash) process.exit(0);
if (hash !== upstreamHash) {
  throw new Error(
    'Miniflare browser security patch does not match the installed artifact. Review the dependency upgrade.',
  );
}
const start = source.indexOf('// ../../node_modules/.pnpm/@puppeteer+browsers@');
const end = source.indexOf('// embed-worker:', start);
if (start < 0 || end < start) throw new Error('Miniflare embedded browser module was not found.');
let patched =
  source.slice(0, start) +
  'var { Browser, detectBrowserPlatform, resolveBuildId: resolveBuildId4, install, launch, CDP_WEBSOCKET_ENDPOINT_REGEX } = require("@puppeteer/browsers");\n' +
  source.slice(end);
patched = patched
  .replace(
    'var BROWSER_VERSION = "126.0.6478.182";',
    'var BROWSER_VERSION = require("puppeteer-core").PUPPETEER_REVISIONS.chrome;',
  )
  .replace(
    'args: process.env.CI ? [...launchArgs, "--no-sandbox"] : launchArgs,',
    'args: launchArgs,',
  );
// esbuild's __commonJS helper only constructs a lazy closure; marking these
// declarations pure lets its tree shaker discard unused embedded dependencies.
patched = patched.replaceAll('= __commonJS({', '= /* @__PURE__ */ __commonJS({');
const result = await transform(patched, {
  format: 'cjs',
  platform: 'node',
  target: 'node26',
  treeShaking: true,
  minifySyntax: true,
  legalComments: 'inline',
});
// Preserve esbuild's static CommonJS export annotation for Node's ESM loader.
const annotationStart = source.indexOf('// Annotate the CommonJS export names');
const annotationEnd = source.indexOf('\n});', annotationStart) + 5;
const output = result.code + source.slice(annotationStart, annotationEnd) + '\n';
if (/extract-zip|basic-ftp|require_extract_zip|126\.0\.6478\.182|--no-sandbox/.test(output)) {
  throw new Error('Miniflare browser security patch retained legacy code or disabled sandboxing.');
}
if (createHash('sha256').update(output).digest('hex') !== patchedHash) {
  throw new Error('Miniflare browser security patch produced an unexpected artifact.');
}
await writeFile(entrypoint, output);
console.log('Applied Miniflare browser security patch.');
