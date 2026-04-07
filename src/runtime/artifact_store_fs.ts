import { assertPathInsideSnapshot, joinSnapshotPath } from '../package_review/snapshot_path.ts';
import type { RuntimeArtifactStore } from './artifact_store.ts';

const RUNTIME_SNAPSHOT_OUTSIDE_MESSAGE = 'Runtime file is outside the reviewed snapshot.';

const FILE_SYSTEM_RUNTIME_ARTIFACT_STORE: RuntimeArtifactStore = {
  async readBytes(snapshotRoot, relativePath) {
    const absolutePath = joinSnapshotPath(
      snapshotRoot,
      relativePath,
      RUNTIME_SNAPSHOT_OUTSIDE_MESSAGE,
    );

    assertPathInsideSnapshot(snapshotRoot, absolutePath, RUNTIME_SNAPSHOT_OUTSIDE_MESSAGE);

    return await Deno.readFile(absolutePath);
  },
};

export function getDefaultRuntimeArtifactStore(): RuntimeArtifactStore {
  return FILE_SYSTEM_RUNTIME_ARTIFACT_STORE;
}
