import { assertEquals } from '@std/assert';
import { validateWorkerConfigBindings } from './check_worker_config.ts';

Deno.test('validateWorkerConfigBindings accepts wrangler config with LOADER and PACKAGE_ARTIFACTS', () => {
  const config = `{
    "worker_loaders": [
      {
        "binding": "LOADER"
      }
    ],
    "r2_buckets": [
      {
        "binding": "PACKAGE_ARTIFACTS"
      }
    ]
  }`;

  assertEquals(validateWorkerConfigBindings(config), []);
});

Deno.test('validateWorkerConfigBindings reports missing required Worker bindings', () => {
  const config = `{
    "worker_loaders": [],
    "r2_buckets": []
  }`;

  assertEquals(validateWorkerConfigBindings(config), [
    'worker_loaders binding LOADER',
    'r2_buckets binding PACKAGE_ARTIFACTS',
  ]);
});
