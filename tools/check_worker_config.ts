import type { WorkerConfig } from 'cf/config';
import config from '../cloudflare.config.ts';
import { appWriterPlatform } from '../cloudflare.platform.ts';

/** Check the deployment configuration for Lantern's required platform boundaries. */
export function validateWorkerConfigBindings(worker: WorkerConfig): string[] {
  const failures: string[] = [];
  const env = worker.env ?? {};
  if (!worker.domains?.includes('lantern.appboundary.com'))
    failures.push('production custom domain');
  const required = {
    DB: 'd1',
    PACKAGE_ARTIFACTS: 'r2',
    LOADER: 'worker-loader',
    AI: 'ai',
    APP_WRITER_SOURCE_COMPILER: 'worker',
    APP_WRITER_PREVIEWER: 'worker',
    APP_WRITER_AGENT: 'durable-object',
    PYTHON_GRADER_SANDBOX: 'durable-object',
    APP_GENERATION_WORKFLOW: 'workflow',
    PYTHON_LAB_GENERATION_WORKFLOW: 'workflow',
  };
  for (const [name, type] of Object.entries(required)) {
    const binding = env[name];
    if (!binding || binding.type !== type) failures.push(`${name} binding (${type})`);
  }
  for (const name of ['AppWriterAgent', 'PythonGraderSandbox']) {
    const declaration = worker.exports?.[name];
    if (
      declaration?.type !== 'durable-object' ||
      !('storage' in declaration) ||
      declaration.storage !== 'sqlite'
    ) {
      failures.push(`${name} SQLite export`);
    }
  }
  for (const [name, workflowName] of Object.entries({
    AppGenerationWorkflow: 'lantern-app-generation',
    PythonLabGenerationWorkflow: 'lantern-python-lab-generation',
  })) {
    const declaration = worker.exports?.[name];
    if (declaration?.type !== 'workflow' || declaration.name !== workflowName)
      failures.push(`${name} workflow export`);
  }
  if ('HYPERDRIVE' in env) failures.push('prohibited legacy HYPERDRIVE binding');
  return failures;
}

/** Check that the auxiliary platform service has Browser Rendering enabled. */
export function validateAppWriterPlatformConfigBindings(worker: WorkerConfig): string[] {
  const binding = worker.env?.BROWSER;
  return binding && binding.type === 'browser' ? [] : ['BROWSER binding'];
}

if (import.meta.main) {
  const failures = [
    ...validateWorkerConfigBindings(config.worker),
    ...validateAppWriterPlatformConfigBindings(appWriterPlatform),
  ];
  if (failures.length > 0)
    throw new Error(
      `Cloudflare configuration is missing required boundaries: ${failures.join(', ')}`,
    );
  console.log(
    'Cloudflare configuration preserves Lantern bindings, exports, and the production domain.',
  );
}
