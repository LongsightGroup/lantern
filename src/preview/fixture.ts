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
  const fixturesFile = readFixturesFilePath(packageVersion.manifestJson);
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
        `Preview fixtures file ${fixturesFile} is missing from reviewed snapshot.`,
      );
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw new Error(`Preview fixtures file ${fixturesFile} must be valid JSON.`);
  }

  return parsePreviewFixtureData(parsed);
}

export function resolvePreviewRuntimeContentPath(packageVersion: PackageVersionRecord): string {
  const canonicalContentPath = readCanonicalContentPath(packageVersion);

  return `${packageVersion.artifact.snapshotRoot}${ensureLeadingSlash(canonicalContentPath)}`;
}

function readFixturesFilePath(manifestJson: Record<string, unknown>): string {
  const previewConfig = asRecord(manifestJson.preview);

  if (!previewConfig) {
    throw new Error('Preview fixtures are required in manifest preview.fixtures_file.');
  }

  const fixturesFile = requireString(
    previewConfig.fixtures_file,
    'Preview manifest preview.fixtures_file must be a non-empty string.',
  );

  if (!fixturesFile.startsWith('/preview/')) {
    throw new Error('Preview manifest preview.fixtures_file must stay under /preview.');
  }

  return fixturesFile;
}

function parsePreviewFixtureData(value: unknown): PreviewFixtureData {
  const fixture = requireRecord(value, 'Preview fixtures must be a JSON object.');
  const launch = requireRecord(fixture.launch, 'Preview fixtures launch object is required.');
  const userRole = requireUserRole(
    launch.user_role,
    'Preview fixtures launch.user_role is required.',
  );
  const courseId = requireString(
    launch.course_id,
    'Preview fixtures launch.course_id is required.',
  );
  const assignmentId = parseOptionalString(
    launch.assignment_id,
    'Preview fixtures launch.assignment_id must be a string or null.',
  );
  const activityId = requireString(
    launch.activity_id,
    'Preview fixtures launch.activity_id is required.',
  );
  const attemptId = requireString(fixture.attempt_id, 'Preview fixtures attempt_id is required.');
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
    throw new TypeError('Preview fixtures local_state must be an object or null.');
  }

  return value as Record<string, unknown>;
}

function resolveSnapshotPath(snapshotRoot: string, filePath: string): string {
  const relativePath = trimLeadingSlash(filePath);
  const absolutePath = joinSnapshotPath(
    snapshotRoot,
    relativePath,
    'Preview fixture path must stay inside the reviewed snapshot.',
  );

  assertPathInsideSnapshot(
    snapshotRoot,
    absolutePath,
    'Preview fixture path must stay inside the reviewed snapshot.',
  );

  return absolutePath;
}

function readCanonicalContentPath(packageVersion: PackageVersionRecord): string {
  const contentFiles = readTrimmedStringArray(packageVersion.manifestJson.content_files);

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
    throw new Error('Preview fixtures launch.user_role must be learner or instructor.');
  }

  return role;
}
