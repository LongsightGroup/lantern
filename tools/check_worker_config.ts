export function validateWorkerConfigBindings(configText: string): string[] {
  return REQUIRED_BINDINGS.filter(({ pattern }) => !pattern.test(configText)).map(
    ({ description }) => description,
  );
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

  console.log('Worker config keeps LOADER and PACKAGE_ARTIFACTS bindings wired.');
}
