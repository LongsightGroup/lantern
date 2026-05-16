const root = new URL('../', import.meta.url);
const outputDir = new URL('output/', root);
const sourcePath = new URL('src/worker.ts', root).pathname;
const rawBundlePath = new URL('worker.bundle.raw.mjs', outputDir);
const bundlePath = new URL('worker.bundle.mjs', outputDir);
const decoder = new TextDecoder();

await Deno.mkdir(outputDir, { recursive: true });

const command = new Deno.Command(Deno.execPath(), {
  args: [
    'bundle',
    '--platform=browser',
    '--external',
    'cloudflare:workers',
    sourcePath,
    '-o',
    rawBundlePath.pathname,
  ],
});
const result = await command.output();

if (!result.success) {
  throw new Error(`Worker bundle build failed:\n${decoder.decode(result.stderr).trim()}`);
}

const rawBundle = await Deno.readTextFile(rawBundlePath);
const workflowImport = 'import { WorkflowEntrypoint } from "cloudflare:workers";\n';

await Deno.writeTextFile(bundlePath, `${workflowImport}${rawBundle}`);
await Deno.remove(rawBundlePath);

console.log(`Built Worker bundle at ${bundlePath.pathname}.`);
