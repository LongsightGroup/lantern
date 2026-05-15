const root = new URL('../', import.meta.url);
const outputDir = new URL('output/', root);
const sourcePath = new URL('src/app_writer/platform_worker.ts', root).pathname;
const bundlePath = new URL('app-writer-platform.bundle.mjs', outputDir);
const decoder = new TextDecoder();

await Deno.mkdir(outputDir, { recursive: true });

const command = new Deno.Command(Deno.execPath(), {
  args: ['bundle', '--platform=browser', sourcePath, '-o', bundlePath.pathname],
});
const result = await command.output();

if (!result.success) {
  throw new Error(
    `App writer platform service bundle build failed:\n${decoder.decode(result.stderr).trim()}`,
  );
}

console.log(`Built app writer platform service bundle at ${bundlePath.pathname}.`);
