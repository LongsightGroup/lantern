import type { UserRole } from '../../sdk/app-sdk.ts';
import {
  assertPathInsideSnapshot,
  ensureLeadingSlash,
  joinSnapshotPath,
  trimLeadingSlash,
} from '../package_review/snapshot_path.ts';
import type { PackageVersionRecord, PreviewFixtureData } from '../package_review/types.ts';

export async function loadPreviewFixtureData(
  packageVersion: PackageVersionRecord,
): Promise<PreviewFixtureData> {
  const manifestJson = await loadReviewedManifestJson(packageVersion);
  const fixturesFile = readFixturesFilePath(manifestJson);
  const fixtureAbsolutePath = resolveSnapshotPath(
    packageVersion.artifact.snapshotRoot,
    fixturesFile,
  );
  let sourceText: string;

  try {
    sourceText = await Deno.readTextFile(fixtureAbsolutePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new TypeError(
        `Saved test launch file ${fixturesFile} is missing from the reviewed app files.`,
      );
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw new Error(`Saved test launch file ${fixturesFile} must be valid JSON.`);
  }

  return parsePreviewFixtureData(parsed);
}

export async function resolvePreviewRuntimeContentPath(
  packageVersion: PackageVersionRecord,
): Promise<string> {
  const canonicalContentPath = await resolvePreviewContentPath(packageVersion);

  return `${packageVersion.artifact.snapshotRoot}${ensureLeadingSlash(canonicalContentPath)}`;
}

export async function resolvePreviewContentPath(
  packageVersion: PackageVersionRecord,
): Promise<string> {
  const manifestJson = await loadReviewedManifestJson(packageVersion);
  return ensureLeadingSlash(readCanonicalContentPath(manifestJson));
}

async function loadReviewedManifestJson(
  packageVersion: PackageVersionRecord,
): Promise<Record<string, unknown>> {
  let sourceText: string;

  try {
    sourceText = await Deno.readTextFile(packageVersion.artifact.manifestPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new TypeError('Reviewed manifest.json is missing from the saved app files.');
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw new Error('Reviewed manifest.json must be valid JSON.');
  }

  return requireRecord(parsed, 'Reviewed manifest.json must be a JSON object.');
}

function readFixturesFilePath(manifestJson: Record<string, unknown>): string {
  const previewConfig = asRecord(manifestJson.preview);

  if (!previewConfig) {
    throw new Error('Saved test launch data is required in manifest preview.fixtures_file.');
  }

  const fixturesFile = requireString(
    previewConfig.fixtures_file,
    'Saved test launch file path must be a non-empty string.',
  );

  if (!fixturesFile.startsWith('/preview/')) {
    throw new Error('Saved test launch file path must stay under /preview.');
  }

  return fixturesFile;
}

function parsePreviewFixtureData(value: unknown): PreviewFixtureData {
  const fixture = requireRecord(value, 'Saved test launch data must be a JSON object.');
  const launch = requireRecord(fixture.launch, 'Saved test launch details are required.');
  const userRole = requireUserRole(launch.user_role, 'Saved test launch role is required.');
  const courseId = requireString(launch.course_id, 'Saved test launch course ID is required.');
  const assignmentId = parseOptionalString(
    launch.assignment_id,
    'Saved test launch assignment ID must be a string or blank.',
  );
  const activityId = requireString(
    launch.activity_id,
    'Saved test launch activity ID is required.',
  );
  const attemptId = requireString(fixture.attempt_id, 'Saved test launch attempt ID is required.');
  const localState = parseLocalState(fixture.local_state);

  return {
    launch: {
      user_role: userRole,
      course_id: courseId,
      assignment_id: assignmentId,
      activity_id: activityId,
    },
    attempt_id: attemptId,
    local_state: localState,
  };
}

function parseLocalState(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Saved test launch local state must be an object or null.');
  }

  return value as Record<string, unknown>;
}

function resolveSnapshotPath(snapshotRoot: string, filePath: string): string {
  const relativePath = trimLeadingSlash(filePath);
  const absolutePath = joinSnapshotPath(
    snapshotRoot,
    relativePath,
    'Saved test launch file path must stay inside the reviewed app files.',
  );

  assertPathInsideSnapshot(
    snapshotRoot,
    absolutePath,
    'Saved test launch file path must stay inside the reviewed app files.',
  );

  return absolutePath;
}

function readCanonicalContentPath(manifestJson: Record<string, unknown>): string {
  const contentFiles = readTrimmedStringArray(manifestJson.content_files);

  return contentFiles[0] ?? '/content/activity.json';
}

function readTrimmedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }

  return value.trim();
}

function parseOptionalString(value: unknown, message: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError(message);
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function requireUserRole(value: unknown, message: string): UserRole {
  const role = requireString(value, message);

  if (role !== 'learner' && role !== 'instructor') {
    throw new Error('Saved test launch role must be learner or instructor.');
  }

  return role;
}
