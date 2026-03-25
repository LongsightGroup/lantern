import type { PackageArtifactRecord } from './types.ts';
import { type ManifestReviewData, validateManifest } from './manifest.ts';

export const DEMO_PACKAGE_SOURCE_ROOT = 'examples/apps/chapter-4-asteroids';
export const DEFAULT_PACKAGE_STORAGE_ROOT = 'var/packages';

export interface ImportedPackageVersion {
  reviewData: ManifestReviewData;
  artifact: PackageArtifactRecord;
}

export async function importDemoPackage(
  options: { storageRoot?: string } = {},
): Promise<ImportedPackageVersion> {
  const validation = await validateManifest({
    sourceRoot: DEMO_PACKAGE_SOURCE_ROOT,
  });

  if (!validation.ok) {
    const details = validation.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Demo package failed validation: ${details}`);
  }

  const storageRoot = options.storageRoot ?? DEFAULT_PACKAGE_STORAGE_ROOT;
  const snapshotRoot = joinFileSystemPath(
    storageRoot,
    validation.reviewData.appId,
    validation.reviewData.version,
  );

  if (await pathExists(snapshotRoot)) {
    throw new Error(
      `Package version ${validation.reviewData.appId}@${validation.reviewData.version} already exists and cannot be replaced.`,
    );
  }

  await copyDirectory(DEMO_PACKAGE_SOURCE_ROOT, snapshotRoot);

  const artifact = await buildArtifactRecord(snapshotRoot, validation.reviewData.entrypoint);

  return {
    reviewData: validation.reviewData,
    artifact,
  };
}

async function buildArtifactRecord(
  snapshotRoot: string,
  entrypoint: string,
): Promise<PackageArtifactRecord> {
  return {
    snapshotRoot,
    manifestPath: joinFileSystemPath(snapshotRoot, 'manifest.json'),
    entrypointPath: joinFileSystemPath(snapshotRoot, trimLeadingSlash(entrypoint)),
    digest: await createDirectoryDigest(snapshotRoot),
  };
}

async function copyDirectory(sourceRoot: string, destinationRoot: string): Promise<void> {
  await Deno.mkdir(destinationRoot, { recursive: true });

  for await (const entry of Deno.readDir(sourceRoot)) {
    const sourcePath = joinFileSystemPath(sourceRoot, entry.name);
    const destinationPath = joinFileSystemPath(destinationRoot, entry.name);

    if (entry.isDirectory) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile) {
      await Deno.mkdir(parentDirectory(destinationPath), { recursive: true });
      await Deno.copyFile(sourcePath, destinationPath);
    }
  }
}

async function createDirectoryDigest(root: string): Promise<string> {
  const encoder = new TextEncoder();
  const files = await collectRelativeFiles(root);
  const parts: Uint8Array[] = [];

  for (const relativePath of files) {
    parts.push(encoder.encode(`${relativePath}\n`));
    parts.push(await Deno.readFile(joinFileSystemPath(root, relativePath)));
    parts.push(encoder.encode('\n'));
  }

  const bytes = concatenate(parts);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);

  return `sha256:${encodeHex(new Uint8Array(digest))}`;
}

async function collectRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  await walk(root, '', files);

  files.sort();

  return files;
}

async function walk(root: string, relativeRoot: string, files: string[]): Promise<void> {
  const absoluteRoot = relativeRoot ? joinFileSystemPath(root, relativeRoot) : root;

  for await (const entry of Deno.readDir(absoluteRoot)) {
    const relativePath = relativeRoot ? joinFileSystemPath(relativeRoot, entry.name) : entry.name;

    if (entry.isDirectory) {
      await walk(root, relativePath, files);
      continue;
    }

    if (entry.isFile) {
      files.push(relativePath);
    }
  }
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }

  return joined;
}

function encodeHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function parentDirectory(path: string): string {
  const parts = path.split('/');

  parts.pop();

  return parts.join('/') || '.';
}

function joinFileSystemPath(...segments: string[]): string {
  if (segments.length === 0) {
    return '.';
  }

  const [firstSegment = '.', ...rest] = segments;
  let path = firstSegment.replace(/\/+$/, '');

  for (const segment of rest) {
    path = `${path}/${segment.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  }

  return path.replaceAll(/\/{2,}/g, '/');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }

    throw error;
  }
}
