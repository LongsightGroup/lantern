import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { test } from 'vite-plus/test';
import { tmpdir } from 'node:os';
import { assertEquals, assertThrows } from '@std/assert';
import {
  buildCloudflareR2PutArgs,
  listReferencePackageSourceUploads,
  readArgs,
  syncReferencePackageSources,
} from './reference_sync_support.ts';

test('readArgs defaults to remote sync across all curated reference apps', () => {
  const args = readArgs(['--bucket=lantern-artifacts']);

  assertEquals(args.bucket, 'lantern-artifacts');
  assertEquals(args.mode, 'remote');
  assertEquals(args.dryRun, false);
  assertEquals(args.appIds.length > 0, true);
});

test('readArgs accepts local filtered sync and rejects persist-to without local', () => {
  const parsed = readArgs([
    '--bucket=lantern-artifacts',
    '--app-id=template-app',
    '--local',
    '--persist-to=.cloudflare/state',
    '--dry-run',
  ]);

  assertEquals(parsed.appIds, ['template-app']);
  assertEquals(parsed.mode, 'local');
  assertEquals(parsed.persistTo, '.cloudflare/state');
  assertEquals(parsed.dryRun, true);

  assertThrows(
    () => readArgs(['--bucket=lantern-artifacts', '--persist-to=.cloudflare/state']),
    Error,
    '--persist-to requires --local.',
  );
});

test('listReferencePackageSourceUploads maps source files into the curated bucket layout', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lantern-reference-sync-'));

  try {
    await mkdir(`${sourceRoot}/dist`, { recursive: true });
    await writeFile(`${sourceRoot}/manifest.json`, '{}\n');
    await writeFile(`${sourceRoot}/dist/app.js`, "console.log('ok');\n");

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
    await rm(sourceRoot, { recursive: true });
  }
});

test('buildCloudflareR2PutArgs keeps Cloudflare scoped to one explicit object write', () => {
  const args = buildCloudflareR2PutArgs(
    {
      bucket: 'lantern-artifacts',
      appIds: ['template-app'],
      mode: 'local',
      cloudflareMode: 'staging',
      persistTo: '.cloudflare/state',
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
    'r2',
    'objects',
    'put',
    'reference-packages/template-app/source/manifest.json',
    '--bucket-name',
    'lantern-artifacts',
    '--file',
    'examples/apps/template/manifest.json',
    '--mode',
    'staging',
    '--local',
    '--persist-to',
    '.cloudflare/state',
  ]);
});

test('syncReferencePackageSources dry-run plans uploads without invoking Cloudflare', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lantern-reference-sync-'));
  const commands: string[][] = [];

  try {
    await writeFile(`${sourceRoot}/manifest.json`, '{}\n');

    const summary = await syncReferencePackageSources(
      {
        bucket: 'lantern-artifacts',
        appIds: ['template-app'],
        mode: 'remote',
        cloudflareMode: null,
        persistTo: null,
        dryRun: true,
      },
      {
        resolveSourceRoot: () => sourceRoot,
        resolveBucketRoot: () => 'reference-packages/template-app/source',
        runCloudflareCommand(args) {
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
    await rm(sourceRoot, { recursive: true });
  }
});
