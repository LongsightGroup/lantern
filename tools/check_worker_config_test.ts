import { test } from 'vite-plus/test';
import { assertEquals } from '@std/assert';
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
