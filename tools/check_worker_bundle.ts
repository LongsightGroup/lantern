import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readBuildOutput } from '@cloudflare/build-output-utils';
const output = await readBuildOutput(process.cwd());
const moduleTexts: string[] = [];
for (const worker of Object.values(output.workers)) {
  if (!worker.bundleDir || !worker.config.manifest)
    throw new Error('Expected a built Worker module manifest.');
  for (const [path, module] of Object.entries(worker.config.manifest.modules)) {
    if (module.type === 'esm' || module.type === 'cjs') {
      moduleTexts.push(await readFile(join(worker.bundleDir, path), 'utf8'));
    }
  }
}
if (Object.keys(output.workers).length !== 2)
  throw new Error('Expected the gateway and platform service in the build.');
if (!output.containers.some((container) => container.config.name === 'lantern-python-grader-v1'))
  throw new Error('Python grader container is absent from the build.');
const bundleText = moduleTexts.join('\n');
const forbiddenPatterns = [
  {
    description: 'direct Deno global',
    pattern: /\bDeno\./,
  },
  {
    description: 'globalThis.Deno access',
    pattern: /globalThis\.Deno/,
  },
  {
    description: 'Deno env fallback',
    pattern: /deno\.Deno\?\.env/,
  },
];

const failures = forbiddenPatterns
  .map(({ description, pattern }) => {
    const match = bundleText.match(pattern);

    if (match === null) {
      return null;
    }

    return `${description}: ${match[0]}`;
  })
  .filter((failure): failure is string => failure !== null);

if (failures.length > 0) {
  throw new Error(
    `Worker bundle includes Deno-only runtime references:\n${failures
      .map((value) => `- ${value}`)
      .join('\n')}`,
  );
}

console.log('Worker bundle is free of Deno runtime references.');
