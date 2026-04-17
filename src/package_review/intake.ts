import type { PackageArtifactRecord } from './types.ts';
import { type ManifestReviewData, validateManifest } from './manifest.ts';
import type { EnvReader } from '../platform/env.ts';
import type { PackageSource } from './package_source.ts';
import type { PackageSnapshotStore } from './snapshot_store.ts';
import { buildSignedReviewedRuntimeContract } from './runtime_contract.ts';
import type { ReviewedRuntimeContract } from './types.ts';

export const REFERENCE_PACKAGE_SOURCE_ROOTS = {
  'template-app': 'examples/apps/template',
  'chapter-4-asteroids': 'examples/apps/chapter-4-asteroids',
  'quick-study': 'examples/apps/quick-study',
  'web-checkup': 'examples/apps/web-checkup',
  'typescript-ladder-game': 'examples/apps/typescript-ladder-game',
} as const;
export const REFERENCE_PACKAGE_BUCKET_ROOT = 'reference-packages';

export type ReferencePackageId = keyof typeof REFERENCE_PACKAGE_SOURCE_ROOTS;

export const DEMO_PACKAGE_SOURCE_ROOT = REFERENCE_PACKAGE_SOURCE_ROOTS['chapter-4-asteroids'];
export const DEFAULT_PACKAGE_STORAGE_ROOT = 'var/packages';

export interface ImportedPackageVersion {
  reviewData: ManifestReviewData;
  artifact: PackageArtifactRecord;
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
}

interface PackageReviewDataOptions {
  packageLabel?: string;
}

interface PackageSnapshotInput {
  storageRoot?: string;
  source: PackageSource;
  snapshotStore: PackageSnapshotStore;
  env: EnvReader;
}

interface ReferencePackageSnapshotInput extends PackageSnapshotInput {
  appId: string;
}

export function listReferencePackageIds(): ReferencePackageId[] {
  return Object.keys(REFERENCE_PACKAGE_SOURCE_ROOTS) as ReferencePackageId[];
}

export function isReferencePackageId(value: string): value is ReferencePackageId {
  return Object.hasOwn(REFERENCE_PACKAGE_SOURCE_ROOTS, value);
}

export function getReferencePackageSourceRoot(appId: string): string {
  if (!isReferencePackageId(appId)) {
    throw new Error(`Lantern does not ship a curated reference package for ${appId}.`);
  }

  return REFERENCE_PACKAGE_SOURCE_ROOTS[appId];
}

export function getReferencePackageBucketSourceRoot(appId: string): string {
  assertReferencePackageId(appId);

  return joinPath(REFERENCE_PACKAGE_BUCKET_ROOT, appId, 'source');
}

export async function readReferencePackageReviewData(
  appId: string,
  source: PackageSource,
): Promise<ManifestReviewData> {
  return await readPackageReviewData(source, {
    packageLabel: `Reference package ${appId}`,
  });
}

export async function readPackageReviewData(
  source: PackageSource,
  options: PackageReviewDataOptions = {},
): Promise<ManifestReviewData> {
  const validation = await validateManifest(source);

  if (!validation.ok) {
    const details = validation.issues.map((issue) => issue.message).join('; ');
    const packageLabel = options.packageLabel ?? 'Package';
    throw new Error(`${packageLabel} failed validation: ${details}`);
  }

  return validation.reviewData;
}

export async function readDemoPackageReviewData(
  source: PackageSource,
): Promise<ManifestReviewData> {
  return await readReferencePackageReviewData('chapter-4-asteroids', source);
}

export async function loadReferencePackageSnapshot(
  input: ReferencePackageSnapshotInput,
): Promise<ImportedPackageVersion | null> {
  assertReferencePackageId(input.appId);

  return await loadPackageSnapshot({
    ...input,
    source: input.source,
  });
}

export async function loadPackageSnapshot(
  input: PackageSnapshotInput,
): Promise<ImportedPackageVersion | null> {
  const reviewData = await readPackageReviewData(input.source);
  const storageRoot = input.storageRoot ?? DEFAULT_PACKAGE_STORAGE_ROOT;
  const snapshotRoot = buildSnapshotRoot(storageRoot, reviewData.appId, reviewData.version);

  if (!(await input.snapshotStore.fileExists(snapshotRoot, 'manifest.json'))) {
    return null;
  }

  return await finalizeImportedPackageVersion({
    reviewData,
    artifact: await buildArtifactRecord(input.snapshotStore, snapshotRoot, reviewData.entrypoint),
    env: input.env,
  });
}

export async function loadDemoPackageSnapshot(options: {
  storageRoot?: string;
  source: PackageSource;
  snapshotStore: PackageSnapshotStore;
  env: EnvReader;
}): Promise<ImportedPackageVersion | null> {
  return await loadReferencePackageSnapshot({
    appId: 'chapter-4-asteroids',
    ...(options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot }),
    source: options.source,
    snapshotStore: options.snapshotStore,
    env: options.env,
  });
}

export async function importReferencePackage(
  input: ReferencePackageSnapshotInput,
): Promise<ImportedPackageVersion> {
  assertReferencePackageId(input.appId);

  return await importPackage({
    ...input,
    source: input.source,
  });
}

export async function importPackage(input: PackageSnapshotInput): Promise<ImportedPackageVersion> {
  const reviewData = await readPackageReviewData(input.source);
  const storageRoot = input.storageRoot ?? DEFAULT_PACKAGE_STORAGE_ROOT;
  const snapshotRoot = buildSnapshotRoot(storageRoot, reviewData.appId, reviewData.version);

  if (await input.snapshotStore.fileExists(snapshotRoot, 'manifest.json')) {
    throw new Error(
      `Package version ${reviewData.appId}@${reviewData.version} already exists and cannot be replaced.`,
    );
  }

  await writeSnapshotFiles(
    input.snapshotStore,
    snapshotRoot,
    await input.source.listFiles(),
    input.source,
  );

  const artifact = await buildArtifactRecord(
    input.snapshotStore,
    snapshotRoot,
    reviewData.entrypoint,
  );

  return await finalizeImportedPackageVersion({
    reviewData,
    artifact,
    env: input.env,
  });
}

export async function importDemoPackage(options: {
  storageRoot?: string;
  source: PackageSource;
  snapshotStore: PackageSnapshotStore;
  env: EnvReader;
}): Promise<ImportedPackageVersion> {
  return await importReferencePackage({
    appId: 'chapter-4-asteroids',
    ...(options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot }),
    source: options.source,
    snapshotStore: options.snapshotStore,
    env: options.env,
  });
}

async function finalizeImportedPackageVersion(input: {
  reviewData: ManifestReviewData;
  artifact: PackageArtifactRecord;
  env: EnvReader;
}): Promise<ImportedPackageVersion> {
  return {
    reviewData: input.reviewData,
    artifact: input.artifact,
    ...(await buildSignedReviewedRuntimeContract({
      reviewData: input.reviewData,
      artifactDigest: input.artifact.digest,
      env: input.env,
    })),
  };
}

async function buildArtifactRecord(
  snapshotStore: PackageSnapshotStore,
  snapshotRoot: string,
  entrypoint: string,
): Promise<PackageArtifactRecord> {
  return {
    snapshotRoot,
    manifestPath: joinPath(snapshotRoot, 'manifest.json'),
    entrypointPath: joinPath(snapshotRoot, trimLeadingSlash(entrypoint)),
    digest: await createDirectoryDigest(snapshotStore, snapshotRoot),
  };
}

async function createDirectoryDigest(
  snapshotStore: PackageSnapshotStore,
  snapshotRoot: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const files = await snapshotStore.listFiles(snapshotRoot);
  const parts: Uint8Array[] = [];

  for (const relativePath of files) {
    parts.push(encoder.encode(`${relativePath}\n`));
    parts.push(await snapshotStore.readBytes(snapshotRoot, relativePath));
    parts.push(encoder.encode('\n'));
  }

  const bytes = concatenate(parts);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);

  return `sha256:${encodeHex(new Uint8Array(digest))}`;
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

function joinPath(...segments: string[]): string {
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

function buildSnapshotRoot(storageRoot: string, appId: string, version: string): string {
  return joinPath(storageRoot, appId, version);
}

function assertReferencePackageId(appId: string): void {
  if (!isReferencePackageId(appId)) {
    throw new Error(`Lantern does not ship a curated reference package for ${appId}.`);
  }
}

async function writeSnapshotFiles(
  snapshotStore: PackageSnapshotStore,
  snapshotRoot: string,
  files: string[],
  source: PackageSource,
): Promise<void> {
  const manifestFiles = files.filter((relativePath) => relativePath === 'manifest.json');
  const otherFiles = files.filter((relativePath) => relativePath !== 'manifest.json');

  for (const relativePath of [...otherFiles, ...manifestFiles]) {
    const bytes = await source.readBytes(relativePath);

    if (bytes === null) {
      throw new Error(`Reference package file ${relativePath} could not be read.`);
    }

    await snapshotStore.writeBytes(snapshotRoot, relativePath, bytes);
  }
}
