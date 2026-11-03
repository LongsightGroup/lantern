import { test } from 'vite-plus/test';
import { assert, assertEquals } from '@std/assert';
import { bindings } from 'cf/config';
import config from '../cloudflare.config.ts';
import { appWriterPlatform } from '../cloudflare.platform.ts';
import {
  validateWorkerConfigBindings,
  validateAppWriterPlatformConfigBindings,
} from './check_worker_config.ts';

test('Cloudflare configuration preserves all required platform boundaries', () => {
  assertEquals(validateWorkerConfigBindings(config.worker), []);
  assertEquals(validateAppWriterPlatformConfigBindings(appWriterPlatform), []);
});

test('Cloudflare configuration check detects a missing gateway binding', () => {
  assertEquals(
    validateWorkerConfigBindings({
      ...config.worker,
      env: { ...config.worker.env, LOADER: bindings.text('wrong') },
    }),
    ['LOADER binding (worker-loader)'],
  );
});

test('Cloudflare configuration check rejects legacy Hyperdrive access', () => {
  assertEquals(
    validateWorkerConfigBindings({
      ...config.worker,
      env: { ...config.worker.env, HYPERDRIVE: bindings.hyperdrive({ id: 'unused' }) },
    }),
    ['prohibited legacy HYPERDRIVE binding'],
  );
});

test('Python container cutover uses a fresh namespace and preserves the previous namespace', () => {
  assertEquals(config.worker.env.PYTHON_GRADER_SANDBOX.exportName, 'PythonGraderRuntime');
  const replacement = config.worker.exports.PythonGraderRuntime;
  assert(replacement.storage === 'sqlite');
  assertEquals(replacement.container, config.containers[0]);
  assertEquals(config.containers[0]?.schedulingPolicy, 'durable-object');
  assertEquals('container' in config.worker.exports.PythonGraderSandbox, false);
  assertEquals(
    validateWorkerConfigBindings({
      ...config.worker,
      env: {
        ...config.worker.env,
        PYTHON_GRADER_SANDBOX: bindings.durableObject({
          worker: 'lantern',
          exportName: 'PythonGraderSandbox',
        }),
      },
    }),
    ['PYTHON_GRADER_SANDBOX replacement namespace'],
  );
});
