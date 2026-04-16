import { requireRelativeSnapshotPath, trimLeadingSlash } from './snapshot_path.ts';
import type { RuntimeArtifactBucket } from '../runtime/artifact_store.ts';

export interface PackageSource {
  readBytes(relativePath: string): Promise<Uint8Array | null>;
  readText(relativePath: string): Promise<string | null>;
  fileExists(relativePath: string): Promise<boolean>;
  listFiles(): Promise<string[]>;
}

export interface MemoryPackageSourceFile {
  relativePath: string;
  bytes: Uint8Array | ArrayBuffer | ArrayBufferView | string;
}

const PACKAGE_SOURCE_OUTSIDE_MESSAGE = 'Package source file must stay inside the reviewed package.';

export function createBucketPackageSource(
  bucket: RuntimeArtifactBucket,
  rootPrefix: string,
): PackageSource {
  return {
    async readBytes(relativePath) {
      const object = await bucket.get(joinBucketKey(rootPrefix, relativePath));

      if (object === null) {
        return null;
      }

      return new Uint8Array(await object.arrayBuffer());
    },
    async readText(relativePath) {
      const bytes = await this.readBytes(relativePath);

      return bytes === null ? null : new TextDecoder().decode(bytes);
    },
    async fileExists(relativePath) {
      return (await bucket.get(joinBucketKey(rootPrefix, relativePath))) !== null;
    },
    async listFiles() {
      if (typeof bucket.list !== 'function') {
        throw new TypeError(
          'Artifact bucket list() support is required for package source access.',
        );
      }

      const files: string[] = [];
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      const normalizedRoot = trimLeadingSlash(normalizePrefix(rootPrefix));

      while (true) {
        const page = await bucket.list({
          prefix: normalizedRoot === '' ? '' : `${normalizedRoot}/`,
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

export function createMemoryPackageSource(files: MemoryPackageSourceFile[]): PackageSource {
  const storedFiles = new Map<string, Uint8Array>();

  for (const file of sortMemoryPackageFiles(files)) {
    const relativePath = normalizePackageSourcePath(file.relativePath);

    if (storedFiles.has(relativePath)) {
      throw new Error(`Package source file ${relativePath} was provided more than once.`);
    }

    storedFiles.set(relativePath, toUint8Array(file.bytes));
  }

  return {
    readBytes(relativePath) {
      const bytes = storedFiles.get(normalizePackageSourcePath(relativePath));

      return Promise.resolve(bytes === undefined ? null : bytes.slice());
    },
    async readText(relativePath) {
      const bytes = await this.readBytes(relativePath);

      return bytes === null ? null : new TextDecoder().decode(bytes);
    },
    fileExists(relativePath) {
      return Promise.resolve(storedFiles.has(normalizePackageSourcePath(relativePath)));
    },
    listFiles() {
      return Promise.resolve([...storedFiles.keys()]);
    },
  };
}

function joinBucketKey(rootPrefix: string, relativePath: string): string {
  return trimLeadingSlash(`${normalizePrefix(rootPrefix)}/${trimLeadingSlash(relativePath)}`);
}

function normalizePrefix(rootPrefix: string): string {
  return rootPrefix.replace(/\/+$/, '');
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

function normalizePackageSourcePath(relativePath: string): string {
  return requireRelativeSnapshotPath(
    trimLeadingSlash(relativePath),
    PACKAGE_SOURCE_OUTSIDE_MESSAGE,
  );
}

function sortMemoryPackageFiles(files: MemoryPackageSourceFile[]): MemoryPackageSourceFile[] {
  return [...files].sort((left, right) => {
    const leftPath = normalizePackageSourcePath(left.relativePath);
    const rightPath = normalizePackageSourcePath(right.relativePath);

    return leftPath.localeCompare(rightPath);
  });
}

function toUint8Array(value: string | Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }

  if (value instanceof Uint8Array) {
    return value.slice();
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }

  return new Uint8Array(value.slice(0));
}
