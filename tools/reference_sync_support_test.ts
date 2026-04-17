import { assertEquals, assertThrows } from '@std/assert';
import {
  buildWranglerR2PutArgs,
  listReferencePackageSourceUploads,
  readArgs,
  syncReferencePackageSources,
} from './reference_sync_support.ts';

Deno.test('readArgs defaults to remote sync across all curated reference apps', () => {
  const args = readArgs(['--bucket=lantern-artifacts']);

  assertEquals(args.bucket, 'lantern-artifacts');
  assertEquals(args.mode, 'remote');
  assertEquals(args.dryRun, false);
  assertEquals(args.appIds.length > 0, true);
});

Deno.test('readArgs accepts local filtered sync and rejects persist-to without local', () => {
  const parsed = readArgs([
    '--bucket=lantern-artifacts',
    '--app-id=template-app',
    '--local',
    '--persist-to=.wrangler/state/v3/r2',
    '--dry-run',
  ]);

  assertEquals(parsed.appIds, ['template-app']);
  assertEquals(parsed.mode, 'local');
  assertEquals(parsed.persistTo, '.wrangler/state/v3/r2');
  assertEquals(parsed.dryRun, true);

  assertThrows(
    () => readArgs(['--bucket=lantern-artifacts', '--persist-to=.wrangler/state/v3/r2']),
    Error,
    '--persist-to requires --local.',
  );
});

Deno.test('listReferencePackageSourceUploads maps source files into the curated bucket layout', async () => {
  const sourceRoot = await Deno.makeTempDir({ prefix: 'lantern-reference-sync-' });

  try {
    await Deno.mkdir(`${sourceRoot}/dist`, { recursive: true });
    await Deno.writeTextFile(`${sourceRoot}/manifest.json`, '{}\n');
    await Deno.writeTextFile(`${sourceRoot}/dist/app.js`, "console.log('ok');\n");

    const uploads = await listReferencePackageSourceUploads(['template-app'], {
      resolveSourceRoot: () => sourceRoot,
      resolveBucketRoot: () => 'reference-packages/template-app/source',
    });

    assertEquals(
      uploads.map((upload) => ({
        relativePath: upload.relativePath,
        objectKey: upload.objectKey,
      })),
      [
        {
          relativePath: 'dist/app.js',
          objectKey: 'reference-packages/template-app/source/dist/app.js',
        },
        {
          relativePath: 'manifest.json',
          objectKey: 'reference-packages/template-app/source/manifest.json',
        },
      ],
    );
  } finally {
    await Deno.remove(sourceRoot, { recursive: true });
  }
});

Deno.test('buildWranglerR2PutArgs keeps wrangler scoped to one explicit object write', () => {
  const args = buildWranglerR2PutArgs(
    {
      bucket: 'lantern-artifacts',
      appIds: ['template-app'],
      mode: 'local',
      configPath: 'wrangler.jsonc',
      envName: 'staging',
      persistTo: '.wrangler/state/v3/r2',
      dryRun: false,
    },
    {
      appId: 'template-app',
      relativePath: 'manifest.json',
      sourcePath: 'examples/apps/template/manifest.json',
      objectKey: 'reference-packages/template-app/source/manifest.json',
    },
  );

  assertEquals(args, [
    'wrangler',
    '--config',
    'wrangler.jsonc',
    '--env',
    'staging',
    'r2',
    'object',
    'put',
    'lantern-artifacts/reference-packages/template-app/source/manifest.json',
    '--file',
    'examples/apps/template/manifest.json',
    '--local',
    '--persist-to',
    '.wrangler/state/v3/r2',
    '--force',
  ]);
});

Deno.test('syncReferencePackageSources dry-run plans uploads without invoking wrangler', async () => {
  const sourceRoot = await Deno.makeTempDir({ prefix: 'lantern-reference-sync-' });
  const commands: string[][] = [];

  try {
    await Deno.writeTextFile(`${sourceRoot}/manifest.json`, '{}\n');

    const summary = await syncReferencePackageSources(
      {
        bucket: 'lantern-artifacts',
        appIds: ['template-app'],
        mode: 'remote',
        configPath: null,
        envName: null,
        persistTo: null,
        dryRun: true,
      },
      {
        resolveSourceRoot: () => sourceRoot,
        resolveBucketRoot: () => 'reference-packages/template-app/source',
        runWranglerCommand(args) {
          commands.push(args);

          return Promise.resolve();
        },
      },
    );

    assertEquals(summary.uploads.length, 1);
    assertEquals(commands.length, 0);
    assertEquals(
      summary.uploads[0]?.objectKey,
      'reference-packages/template-app/source/manifest.json',
    );
  } finally {
    await Deno.remove(sourceRoot, { recursive: true });
  }
});
