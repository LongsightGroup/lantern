import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// cf beta.27 still imports helpers removed from the latest Miniflare. Use the
// replacements documented by Cloudflare, keeping one current Miniflare runtime.
const require = createRequire(import.meta.url);
const target = new URL(
  './dist/containers-DINLx5_i.mjs',
  pathToFileURL(require.resolve('cf/package.json')),
);
const originalHash = 'fa8f380186497b3c5ad88dceab4e8dba090cdf845ebc6d0a3b834c30321503c3';
const patchedHash = 'af5ec541a39ef418f123b05c3f6d5d3873731a8c62f5528dd8fedce85d2c80e6';
const source = await readFile(target, 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
if (hash === patchedHash) process.exit(0);
if (hash !== originalHash)
  throw new Error(
    'The cf helper patch does not match the installed artifact. Review the cf upgrade.',
  );
const output = source.replace(
  'import{getFreshSourceMapSupport as Mt,getNodeCompat as Nt}from"miniflare";',
  'import{getFreshSourceMapSupport as Mt}from"@cloudflare/workers-utils/sourcemap";import{getNodeCompat as Nt}from"@cloudflare/workers-utils/node-compat";',
);
if (output === source) throw new Error('The cf helper imports were not found.');
if (createHash('sha256').update(output).digest('hex') !== patchedHash)
  throw new Error('The cf helper patch produced an unexpected artifact.');
await writeFile(target, output);
console.log('Applied cf helper compatibility patch.');
