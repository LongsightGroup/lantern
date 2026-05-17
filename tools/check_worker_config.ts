export function validateWorkerConfigBindings(configText: string): string[] {
  const missing = REQUIRED_BINDINGS.filter(({ pattern }) => !pattern.test(configText)).map(
    ({ description }) => description,
  );
  const prohibited = PROHIBITED_BINDINGS.filter(({ pattern }) => pattern.test(configText)).map(
    ({ description }) => description,
  );

  return [...missing, ...prohibited];
}

export function validateAppWriterPlatformConfigBindings(configText: string): string[] {
  return APP_WRITER_PLATFORM_REQUIRED_BINDINGS.filter(
    ({ pattern }) => !pattern.test(configText),
  ).map(({ description }) => description);
}

const REQUIRED_BINDINGS = [
  {
    description: 'custom domain route lantern.appboundary.com',
    pattern:
      /"routes"\s*:\s*\[[\s\S]*?"pattern"\s*:\s*"lantern\.appboundary\.com"[\s\S]*?"custom_domain"\s*:\s*true/,
  },
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

const APP_WRITER_PLATFORM_REQUIRED_BINDINGS = [
  {
    description: 'browser rendering binding BROWSER',
    pattern: /"browser"\s*:\s*\{[\s\S]*?"binding"\s*:\s*"BROWSER"/,
  },
] as const;

if (import.meta.main) {
  const configPath = new URL('../wrangler.jsonc', import.meta.url);
  const appWriterPlatformConfigPath = new URL(
    '../wrangler.app-writer-platform.jsonc',
    import.meta.url,
  );
  const configText = await Deno.readTextFile(configPath);
  const appWriterPlatformConfigText = await Deno.readTextFile(appWriterPlatformConfigPath);
  const failures = [
    ...validateWorkerConfigBindings(configText),
    ...validateAppWriterPlatformConfigBindings(appWriterPlatformConfigText),
  ];

  if (failures.length > 0) {
    throw new Error(
      `wrangler.jsonc is missing required Worker bindings:\n${failures
        .map((failure) => `- ${failure}`)
        .join('\n')}`,
    );
  }

  console.log(
    'Worker config keeps the production custom domain, DB, LOADER, PACKAGE_ARTIFACTS, APP_GENERATION_WORKFLOW, APP_WRITER_AGENT, app-writer service bindings, and platform Browser Rendering binding wired.',
  );
}
