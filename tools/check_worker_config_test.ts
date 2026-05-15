import { assertEquals } from '@std/assert';
import { validateWorkerConfigBindings } from './check_worker_config.ts';

Deno.test('validateWorkerConfigBindings accepts wrangler config with DB, LOADER, PACKAGE_ARTIFACTS, APP_GENERATION_WORKFLOW, APP_WRITER_AGENT, and app-writer services', () => {
  const config = `{
    "routes": [
      {
        "pattern": "lantern.appboundary.com",
        "custom_domain": true
      }
    ],
    "workflows": [
      {
        "binding": "APP_GENERATION_WORKFLOW",
        "class_name": "AppGenerationWorkflow"
      }
    ],
    "durable_objects": {
      "bindings": [
        {
          "name": "APP_WRITER_AGENT",
          "class_name": "AppWriterAgent"
        }
      ]
    },
    "migrations": [
      {
        "new_sqlite_classes": ["AppWriterAgent"]
      }
    ],
    "services": [
      {
        "binding": "APP_WRITER_SOURCE_COMPILER"
      },
      {
        "binding": "APP_WRITER_PREVIEWER"
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
    'custom domain route lantern.appboundary.com',
    'worker_loaders binding LOADER',
    'r2_buckets binding PACKAGE_ARTIFACTS',
    'd1_databases binding DB',
    'workflows binding APP_GENERATION_WORKFLOW',
    'workflows class AppGenerationWorkflow',
    'durable_objects binding APP_WRITER_AGENT',
    'durable_objects class AppWriterAgent',
    'durable_objects migration AppWriterAgent',
    'services binding APP_WRITER_SOURCE_COMPILER',
    'services binding APP_WRITER_PREVIEWER',
  ]);
});

Deno.test('validateWorkerConfigBindings rejects legacy Hyperdrive production binding', () => {
  const config = `{
    "routes": [
      {
        "pattern": "lantern.appboundary.com",
        "custom_domain": true
      }
    ],
    "workflows": [
      {
        "binding": "APP_GENERATION_WORKFLOW",
        "class_name": "AppGenerationWorkflow"
      }
    ],
    "durable_objects": {
      "bindings": [
        {
          "name": "APP_WRITER_AGENT",
          "class_name": "AppWriterAgent"
        }
      ]
    },
    "migrations": [
      {
        "new_sqlite_classes": ["AppWriterAgent"]
      }
    ],
    "services": [
      {
        "binding": "APP_WRITER_SOURCE_COMPILER"
      },
      {
        "binding": "APP_WRITER_PREVIEWER"
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
