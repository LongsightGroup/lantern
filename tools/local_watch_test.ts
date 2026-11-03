import { test } from 'vite-plus/test';
import { equal, ok } from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { watchLocalPackage } from './local_watch.ts';

test('Node package watcher reports nested file changes with absolute paths and closes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lantern-watch-'));
  await mkdir(join(root, 'content'));
  const watcher = watchLocalPackage(root);
  try {
    const event = watcher.iterator.next();
    await writeFile(join(root, 'content/activity.json'), '{}');
    const result = await event;
    equal(result.done, false);
    ok(result.value?.paths.every((path: string) => path.startsWith(resolve(root))));
  } finally {
    watcher.close();
    await watcher.iterator.return?.();
    await rm(root, { recursive: true });
  }
});
