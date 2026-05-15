export function validateWorkerConfigBindings(configText: string): string[] {
  const missing = REQUIRED_BINDINGS.filter(({ pattern }) => !pattern.test(configText)).map(
    ({ description }) => description,
  );
  const prohibited = PROHIBITED_BINDINGS.filter(({ pattern }) => pattern.test(configText)).map(
    ({ description }) => description,
  );

  return [...missing, ...prohibited];
}

const REQUIRED_BINDINGS = [
  {
    description: 'worker_loaders binding LOADER',
    pattern: /"worker_loaders"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"LOADER"/,
  },
  {
    description: 'r2_buckets binding PACKAGE_ARTIFACTS',
    pattern: /"r2_buckets"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"PACKAGE_ARTIFACTS"/,
  },
  {
    description: 'd1_databases binding DB',
    pattern: /"d1_databases"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"DB"/,
  },
  {
    description: 'workflows binding APP_GENERATION_WORKFLOW',
    pattern: /"workflows"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"APP_GENERATION_WORKFLOW"/,
  },
  {
    description: 'workflows class AppGenerationWorkflow',
    pattern: /"workflows"\s*:\s*\[[\s\S]*?"class_name"\s*:\s*"AppGenerationWorkflow"/,
  },
  {
    description: 'durable_objects binding APP_WRITER_AGENT',
    pattern: /"durable_objects"\s*:\s*\{[\s\S]*?"name"\s*:\s*"APP_WRITER_AGENT"/,
  },
  {
    description: 'durable_objects class AppWriterAgent',
    pattern: /"durable_objects"\s*:\s*\{[\s\S]*?"class_name"\s*:\s*"AppWriterAgent"/,
  },
  {
    description: 'durable_objects migration AppWriterAgent',
    pattern: /"migrations"\s*:\s*\[[\s\S]*?"new_sqlite_classes"\s*:\s*\[[\s\S]*?"AppWriterAgent"/,
  },
  {
    description: 'services binding APP_WRITER_SOURCE_COMPILER',
    pattern: /"services"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"APP_WRITER_SOURCE_COMPILER"/,
  },
  {
    description: 'services binding APP_WRITER_PREVIEWER',
    pattern: /"services"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"APP_WRITER_PREVIEWER"/,
  },
] as const;

const PROHIBITED_BINDINGS = [
  {
    description: 'legacy hyperdrive binding HYPERDRIVE',
    pattern: /"hyperdrive"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"HYPERDRIVE"/,
  },
] as const;

if (import.meta.main) {
  const configPath = new URL('../wrangler.jsonc', import.meta.url);
  const configText = await Deno.readTextFile(configPath);
  const failures = validateWorkerConfigBindings(configText);

  if (failures.length > 0) {
    throw new Error(
      `wrangler.jsonc is missing required Worker bindings:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
    );
  }

  console.log(
    'Worker config keeps DB, LOADER, PACKAGE_ARTIFACTS, APP_GENERATION_WORKFLOW, APP_WRITER_AGENT, and app-writer service bindings wired.',
  );
}
