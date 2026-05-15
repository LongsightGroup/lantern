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
    'Worker config keeps DB, LOADER, PACKAGE_ARTIFACTS, and APP_GENERATION_WORKFLOW bindings wired.',
  );
}
