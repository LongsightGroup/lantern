const bundlePath = new URL('../output/worker.bundle.mjs', import.meta.url);
const bundleText = await Deno.readTextFile(bundlePath);
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
    `Worker bundle includes Deno-only runtime references:\n${failures.map((value) => `- ${value}`).join('\n')}`,
  );
}

console.log('Worker bundle is free of Deno runtime references.');
