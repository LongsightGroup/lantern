import { joinSnapshotPath, trimLeadingSlash } from '../package_review/snapshot_path.ts';

export interface RuntimeArtifactStore {
  readBytes(snapshotRoot: string, relativePath: string): Promise<Uint8Array>;
}

export interface RuntimeArtifactObject {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface RuntimeArtifactBucketListObject {
  key: string;
}

export interface RuntimeArtifactBucketListResult {
  objects: RuntimeArtifactBucketListObject[];
  truncated?: boolean;
  cursor?: string;
}

export interface RuntimeArtifactBucket {
  get(key: string): Promise<RuntimeArtifactObject | null>;
  put?(key: string, value: string | ArrayBuffer | ArrayBufferView): Promise<unknown>;
  list?(options: { prefix: string; cursor?: string }): Promise<RuntimeArtifactBucketListResult>;
}

export function createR2RuntimeArtifactStore(bucket: RuntimeArtifactBucket): RuntimeArtifactStore {
  return {
    async readBytes(snapshotRoot, relativePath) {
      const key = trimLeadingSlash(
        joinSnapshotPath(
          snapshotRoot,
          relativePath,
          'Runtime file is outside the reviewed snapshot.',
        ),
      );
      const object = await bucket.get(key);

      if (object === null) {
        throw new Error(`Reviewed runtime file ${key} was not found.`);
      }

      return new Uint8Array(await object.arrayBuffer());
    },
  };
}
