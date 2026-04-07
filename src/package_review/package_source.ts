import { trimLeadingSlash } from './snapshot_path.ts';
import type { RuntimeArtifactBucket } from '../runtime/artifact_store.ts';

export interface PackageSource {
  readBytes(relativePath: string): Promise<Uint8Array | null>;
  readText(relativePath: string): Promise<string | null>;
  fileExists(relativePath: string): Promise<boolean>;
  listFiles(): Promise<string[]>;
}

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
