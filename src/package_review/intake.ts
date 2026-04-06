import type { PackageArtifactRecord } from "./types.ts";
import { type ManifestReviewData, validateManifest } from "./manifest.ts";
import { buildSignedReviewedRuntimeContract } from "./runtime_contract.ts";
import type { ReviewedRuntimeContract } from "./types.ts";

export const REFERENCE_PACKAGE_SOURCE_ROOTS = {
  "chapter-4-asteroids": "examples/apps/chapter-4-asteroids",
  "quick-study": "examples/apps/quick-study",
} as const;

export type ReferencePackageId = keyof typeof REFERENCE_PACKAGE_SOURCE_ROOTS;

export const DEMO_PACKAGE_SOURCE_ROOT =
  REFERENCE_PACKAGE_SOURCE_ROOTS["chapter-4-asteroids"];
export const DEFAULT_PACKAGE_STORAGE_ROOT = "var/packages";

export interface ImportedPackageVersion {
  reviewData: ManifestReviewData;
  artifact: PackageArtifactRecord;
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
}

export function listReferencePackageIds(): ReferencePackageId[] {
  return Object.keys(REFERENCE_PACKAGE_SOURCE_ROOTS) as ReferencePackageId[];
}

export function getReferencePackageSourceRoot(appId: string): string {
  if (!isReferencePackageId(appId)) {
    throw new Error(
      `Lantern does not ship a curated reference package for ${appId}.`,
    );
  }

  return REFERENCE_PACKAGE_SOURCE_ROOTS[appId];
}

export async function readReferencePackageReviewData(
  appId: string,
): Promise<ManifestReviewData> {
  const validation = await validateManifest({
    sourceRoot: getReferencePackageSourceRoot(appId),
  });

  if (!validation.ok) {
    const details = validation.issues.map((issue) => issue.message).join("; ");
    throw new Error(
      `Reference package ${appId} failed validation: ${details}`,
    );
  }

  return validation.reviewData;
}

export async function readDemoPackageReviewData(): Promise<ManifestReviewData> {
  return await readReferencePackageReviewData("chapter-4-asteroids");
}

export async function loadReferencePackageSnapshot(
  input: { appId: string; storageRoot?: string },
): Promise<ImportedPackageVersion | null> {
  const reviewData = await readReferencePackageReviewData(input.appId);
  const storageRoot = input.storageRoot ?? DEFAULT_PACKAGE_STORAGE_ROOT;
  const snapshotRoot = joinFileSystemPath(
    storageRoot,
    reviewData.appId,
    reviewData.version,
  );

  if (!(await pathExists(snapshotRoot))) {
    return null;
  }

  return await finalizeImportedPackageVersion({
    reviewData,
    artifact: await buildArtifactRecord(snapshotRoot, reviewData.entrypoint),
  });
}

export async function loadDemoPackageSnapshot(
  options: { storageRoot?: string } = {},
): Promise<ImportedPackageVersion | null> {
  return await loadReferencePackageSnapshot({
    appId: "chapter-4-asteroids",
    ...(options.storageRoot === undefined
      ? {}
      : { storageRoot: options.storageRoot }),
  });
}

export async function importReferencePackage(
  input: { appId: string; storageRoot?: string },
): Promise<ImportedPackageVersion> {
  const reviewData = await readReferencePackageReviewData(input.appId);
  const sourceRoot = getReferencePackageSourceRoot(input.appId);
  const storageRoot = input.storageRoot ?? DEFAULT_PACKAGE_STORAGE_ROOT;
  const snapshotRoot = joinFileSystemPath(
    storageRoot,
    reviewData.appId,
    reviewData.version,
  );

  if (await pathExists(snapshotRoot)) {
    throw new Error(
      `Package version ${reviewData.appId}@${reviewData.version} already exists and cannot be replaced.`,
    );
  }

  await copyDirectory(sourceRoot, snapshotRoot);

  const artifact = await buildArtifactRecord(
    snapshotRoot,
    reviewData.entrypoint,
  );

  return await finalizeImportedPackageVersion({ reviewData, artifact });
}

export async function importDemoPackage(
  options: { storageRoot?: string } = {},
): Promise<ImportedPackageVersion> {
  return await importReferencePackage({
    appId: "chapter-4-asteroids",
    ...(options.storageRoot === undefined
      ? {}
      : { storageRoot: options.storageRoot }),
  });
}

async function finalizeImportedPackageVersion(input: {
  reviewData: ManifestReviewData;
  artifact: PackageArtifactRecord;
}): Promise<ImportedPackageVersion> {
  return {
    reviewData: input.reviewData,
    artifact: input.artifact,
    ...(await buildSignedReviewedRuntimeContract({
      reviewData: input.reviewData,
      artifactDigest: input.artifact.digest,
    })),
  };
}

async function buildArtifactRecord(
  snapshotRoot: string,
  entrypoint: string,
): Promise<PackageArtifactRecord> {
  return {
    snapshotRoot,
    manifestPath: joinFileSystemPath(snapshotRoot, "manifest.json"),
    entrypointPath: joinFileSystemPath(
      snapshotRoot,
      trimLeadingSlash(entrypoint),
    ),
    digest: await createDirectoryDigest(snapshotRoot),
  };
}

async function copyDirectory(
  sourceRoot: string,
  destinationRoot: string,
): Promise<void> {
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
    parts.push(encoder.encode("\n"));
  }

  const bytes = concatenate(parts);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return `sha256:${encodeHex(new Uint8Array(digest))}`;
}

async function collectRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  await walk(root, "", files);

  files.sort();

  return files;
}

async function walk(
  root: string,
  relativeRoot: string,
  files: string[],
): Promise<void> {
  const absoluteRoot = relativeRoot
    ? joinFileSystemPath(root, relativeRoot)
    : root;

  for await (const entry of Deno.readDir(absoluteRoot)) {
    const relativePath = relativeRoot
      ? joinFileSystemPath(relativeRoot, entry.name)
      : entry.name;

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
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function parentDirectory(path: string): string {
  const parts = path.split("/");

  parts.pop();

  return parts.join("/") || ".";
}

function joinFileSystemPath(...segments: string[]): string {
  if (segments.length === 0) {
    return ".";
  }

  const [firstSegment = ".", ...rest] = segments;
  let path = firstSegment.replace(/\/+$/, "");

  for (const segment of rest) {
    path = `${path}/${segment.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  }

  return path.replaceAll(/\/{2,}/g, "/");
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

function isReferencePackageId(value: string): value is ReferencePackageId {
  return Object.hasOwn(REFERENCE_PACKAGE_SOURCE_ROOTS, value);
}
