const appId = Deno.args[0]?.trim();

if (!appId || !/^[a-z0-9][a-z0-9-]*$/.test(appId)) {
  throw new Error('Usage: deno task app:build-worker <app-id>');
}

const root = new URL('../', import.meta.url);
const appRoot = new URL(`examples/apps/${appId}/`, root);
const source = new URL('source/worker.ts', appRoot);
const output = new URL('dist/worker.js', appRoot);

try {
  const sourceInfo = await Deno.stat(source);
  if (!sourceInfo.isFile) {
    throw new Error();
  }
} catch {
  throw new Error(`Reviewed Worker source was not found for ${appId}.`);
}

await Deno.mkdir(new URL('dist/', appRoot), { recursive: true });
const command = new Deno.Command(Deno.execPath(), {
  args: [
    'bundle',
    '--platform=browser',
    '--minify',
    source.pathname,
    '-o',
    output.pathname,
  ],
});
const result = await command.output();
if (!result.success) {
  throw new Error(new TextDecoder().decode(result.stderr).trim());
}

console.log(`Built reviewed Worker app ${appId} at ${output.pathname}.`);
