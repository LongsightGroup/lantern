import { readFile, readdir, stat as fileStat } from 'node:fs/promises';
import type { PackageSource } from './package_source.ts';
import { trimLeadingSlash } from './snapshot_path.ts';

export function createFileSystemPackageSource(rootPath: string): PackageSource {
  return {
    async readBytes(relativePath) {
      try {
        return await readFile(joinSourcePath(rootPath, relativePath));
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null;
        }

        throw error;
      }
    },
    async readText(relativePath) {
      const bytes = await this.readBytes(relativePath);

      return bytes === null ? null : new TextDecoder().decode(bytes);
    },
    async fileExists(relativePath) {
      try {
        const stat = await fileStat(joinSourcePath(rootPath, relativePath));

        return stat.isFile();
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return false;
        }

        throw error;
      }
    },
    async listFiles() {
      const files: string[] = [];

      await walkFiles(rootPath, '', files);
      files.sort();

      return files;
    },
  };
}

function joinSourcePath(rootPath: string, relativePath: string): string {
  return [rootPath.replace(/\/+$/, ''), trimLeadingSlash(relativePath)].join('/');
}

async function walkFiles(rootPath: string, relativeRoot: string, files: string[]): Promise<void> {
  const absoluteRoot = relativeRoot === '' ? rootPath : joinSourcePath(rootPath, relativeRoot);

  for (const entry of await readdir(absoluteRoot, { withFileTypes: true })) {
    const relativePath = relativeRoot === '' ? entry.name : `${relativeRoot}/${entry.name}`;

    if (entry.isDirectory()) {
      await walkFiles(rootPath, relativePath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}
