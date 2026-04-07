import {
  joinSnapshotPath,
  normalizeSnapshotPath,
  requireRelativeSnapshotPath,
  trimLeadingSlash,
} from './snapshot_path.ts';
import type { RuntimeArtifactBucket, RuntimeArtifactStore } from '../runtime/artifact_store.ts';

const SNAPSHOT_OUTSIDE_MESSAGE = 'Package snapshot file must stay inside the reviewed snapshot.';

export interface PackageSnapshotStore extends RuntimeArtifactStore {
  writeBytes(snapshotRoot: string, relativePath: string, bytes: Uint8Array): Promise<void>;
  fileExists(snapshotRoot: string, relativePath: string): Promise<boolean>;
  listFiles(snapshotRoot: string): Promise<string[]>;
}

export function createR2PackageSnapshotStore(bucket: RuntimeArtifactBucket): PackageSnapshotStore {
  if (typeof bucket.put !== 'function' || typeof bucket.list !== 'function') {
    throw new TypeError(
      'Artifact bucket get(), put(), and list() support is required for snapshot storage.',
    );
  }

  return {
    async readBytes(snapshotRoot, relativePath) {
      const object = await bucket.get(joinBucketKey(snapshotRoot, relativePath));

      if (object === null) {
        throw new Error(
          `Reviewed snapshot file ${joinBucketKey(snapshotRoot, relativePath)} was not found.`,
        );
      }

      return new Uint8Array(await object.arrayBuffer());
    },
    async writeBytes(snapshotRoot, relativePath, bytes) {
      await bucket.put!(joinBucketKey(snapshotRoot, relativePath), bytes);
    },
    async fileExists(snapshotRoot, relativePath) {
      return (await bucket.get(joinBucketKey(snapshotRoot, relativePath))) !== null;
    },
    async listFiles(snapshotRoot) {
      const files: string[] = [];
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      const normalizedRoot = trimLeadingSlash(
        normalizeSnapshotPath(snapshotRoot, SNAPSHOT_OUTSIDE_MESSAGE),
      );

      while (true) {
        const page = await bucket.list!({
          prefix: `${normalizedRoot}/`,
          ...(cursor === undefined ? {} : { cursor }),
        });

        for (const object of page.objects) {
          if (!object.key.startsWith(`${normalizedRoot}/`)) {
            continue;
          }

          files.push(object.key.slice(normalizedRoot.length + 1));
        }

        if (!page.truncated) {
          break;
        }

        cursor = resolveContinuationCursor(page.cursor, normalizedRoot, seenCursors);
      }

      files.sort();

      return files;
    },
  };
}

function joinBucketKey(snapshotRoot: string, relativePath: string): string {
  return trimLeadingSlash(
    joinSnapshotPath(
      snapshotRoot,
      requireRelativeSnapshotPath(relativePath, SNAPSHOT_OUTSIDE_MESSAGE),
      SNAPSHOT_OUTSIDE_MESSAGE,
    ),
  );
}

function resolveContinuationCursor(
  cursor: string | undefined,
  prefix: string,
  seenCursors: Set<string>,
): string {
  if (cursor === undefined || cursor === '') {
    throw new Error(
      `Artifact bucket list() returned truncated results without a continuation cursor for ${prefix}.`,
    );
  }

  if (seenCursors.has(cursor)) {
    throw new Error(`Artifact bucket list() repeated cursor ${cursor} for ${prefix}.`);
  }

  seenCursors.add(cursor);

  return cursor;
}
