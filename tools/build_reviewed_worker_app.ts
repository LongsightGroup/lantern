import { build } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';
const appId = process.argv.slice(2)[0]?.trim();

if (!appId || !/^[a-z0-9][a-z0-9-]*$/.test(appId)) {
  throw new Error('Usage: npm run app:build-worker -- <app-id>');
}

const root = new URL('../', import.meta.url);
const appRoot = new URL(`examples/apps/${appId}/`, root);
const source = new URL('source/worker.ts', appRoot);
const output = new URL('dist/worker.js', appRoot);

try {
  const sourceInfo = await stat(source);
  if (!sourceInfo.isFile()) {
    throw new Error();
  }
} catch {
  throw new Error(`Reviewed Worker source was not found for ${appId}.`);
}

await mkdir(new URL('dist/', appRoot), { recursive: true });
await build({
  entryPoints: [source.pathname],
  outfile: output.pathname,
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
});

console.log(`Built reviewed Worker app ${appId} at ${output.pathname}.`);
