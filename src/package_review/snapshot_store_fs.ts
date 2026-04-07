import {
  assertPathInsideSnapshot,
  joinSnapshotPath,
  normalizeSnapshotPath,
  requireRelativeSnapshotPath,
} from './snapshot_path.ts';
import type { PackageSnapshotStore } from './snapshot_store.ts';

const SNAPSHOT_OUTSIDE_MESSAGE = 'Package snapshot file must stay inside the reviewed snapshot.';

const FILE_SYSTEM_PACKAGE_SNAPSHOT_STORE: PackageSnapshotStore = {
  async readBytes(snapshotRoot, relativePath) {
    const absolutePath = joinSnapshotPath(snapshotRoot, relativePath, SNAPSHOT_OUTSIDE_MESSAGE);

    assertPathInsideSnapshot(snapshotRoot, absolutePath, SNAPSHOT_OUTSIDE_MESSAGE);

    return await Deno.readFile(absolutePath);
  },
  async writeBytes(snapshotRoot, relativePath, bytes) {
    const absolutePath = joinSnapshotPath(
      snapshotRoot,
      requireRelativeSnapshotPath(relativePath, SNAPSHOT_OUTSIDE_MESSAGE),
      SNAPSHOT_OUTSIDE_MESSAGE,
    );

    await Deno.mkdir(parentDirectory(absolutePath), { recursive: true });
    await Deno.writeFile(absolutePath, bytes);
  },
  async fileExists(snapshotRoot, relativePath) {
    try {
      const stat = await Deno.stat(
        joinSnapshotPath(snapshotRoot, relativePath, SNAPSHOT_OUTSIDE_MESSAGE),
      );

      return stat.isFile;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }

      throw error;
    }
  },
  async listFiles(snapshotRoot) {
    const files: string[] = [];
    const normalizedRoot = normalizeSnapshotPath(snapshotRoot, SNAPSHOT_OUTSIDE_MESSAGE);

    await walkSnapshotFiles(normalizedRoot, '', files);
    files.sort();

    return files;
  },
};

export function getDefaultPackageSnapshotStore(): PackageSnapshotStore {
  return FILE_SYSTEM_PACKAGE_SNAPSHOT_STORE;
}

function parentDirectory(path: string): string {
  const parts = path.split('/');

  parts.pop();

  return parts.join('/') || '.';
}

async function walkSnapshotFiles(
  snapshotRoot: string,
  relativeRoot: string,
  files: string[],
): Promise<void> {
  const absoluteRoot = relativeRoot === '' ? snapshotRoot : `${snapshotRoot}/${relativeRoot}`;

  for await (const entry of Deno.readDir(absoluteRoot)) {
    const relativePath = relativeRoot === '' ? entry.name : `${relativeRoot}/${entry.name}`;

    if (entry.isDirectory) {
      await walkSnapshotFiles(snapshotRoot, relativePath, files);
      continue;
    }

    if (entry.isFile) {
      files.push(relativePath);
    }
  }
}
