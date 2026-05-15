import { assertEquals } from '@std/assert';
import { validateWorkerConfigBindings } from './check_worker_config.ts';

Deno.test('validateWorkerConfigBindings accepts wrangler config with DB, LOADER, PACKAGE_ARTIFACTS, and APP_GENERATION_WORKFLOW', () => {
  const config = `{
    "workflows": [
      {
        "binding": "APP_GENERATION_WORKFLOW",
        "class_name": "AppGenerationWorkflow"
      }
    ],
    "worker_loaders": [
      {
        "binding": "LOADER"
      }
    ],
    "r2_buckets": [
      {
        "binding": "PACKAGE_ARTIFACTS"
      }
    ],
    "d1_databases": [
      {
        "binding": "DB"
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
    'd1_databases binding DB',
    'workflows binding APP_GENERATION_WORKFLOW',
    'workflows class AppGenerationWorkflow',
  ]);
});

Deno.test('validateWorkerConfigBindings rejects legacy Hyperdrive production binding', () => {
  const config = `{
    "workflows": [
      {
        "binding": "APP_GENERATION_WORKFLOW",
        "class_name": "AppGenerationWorkflow"
      }
    ],
    "worker_loaders": [
      {
        "binding": "LOADER"
      }
    ],
    "r2_buckets": [
      {
        "binding": "PACKAGE_ARTIFACTS"
      }
    ],
    "d1_databases": [
      {
        "binding": "DB"
      }
    ],
    "hyperdrive": [
      {
        "binding": "HYPERDRIVE"
      }
    ]
  }`;

  assertEquals(validateWorkerConfigBindings(config), ['legacy hyperdrive binding HYPERDRIVE']);
});
