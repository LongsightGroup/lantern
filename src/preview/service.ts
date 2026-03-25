import type { UserRole } from "../../sdk/app-sdk.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  PackageVersionRecord,
  PreviewFixtureData,
  PreviewSessionRecord,
} from "../package_review/types.ts";

export interface PreviewFakeScoringDefaults {
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress: "Completed";
  gradingProgress: "FullyGraded";
}

export interface CreatedPreviewSession {
  previewSession: PreviewSessionRecord;
  fakeScoring: PreviewFakeScoringDefaults;
}

export async function createPreviewSession(input: {
  repository: PackageReviewRepository;
  packageVersion: PackageVersionRecord;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<CreatedPreviewSession> {
  const previewSession = await input.repository.createPreviewSession(
    await preparePreviewSession(input),
  );

  return {
    previewSession,
    fakeScoring: {
      scoreGiven: 0,
      scoreMaximum: previewSession.fakeScoreMaximum,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    },
  };
}

const PREVIEW_RUNTIME_SESSION_TTL_MS = 10 * 60 * 1000;

export async function launchPreviewRuntimeSession(input: {
  repository: PackageReviewRepository;
  packageVersion: PackageVersionRecord;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<{
  previewSession: PreviewSessionRecord;
  runtimeSession: RuntimeSessionRecord;
}> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const createdAt = now();
  const created = await createPreviewSession({
    repository: input.repository,
    packageVersion: input.packageVersion,
    now,
    createOpaqueToken,
  });
  const runtimeSession = await input.repository.createRuntimeSession({
    sessionId: `preview-runtime-${createOpaqueToken()}`,
    sessionToken: createOpaqueToken(),
    attemptId: created.previewSession.fakeAttemptId,
    deploymentRecordId: 0,
    deploymentSlug: `${created.previewSession.appId}-preview`,
    appId: created.previewSession.appId,
    packageVersionId: created.previewSession.packageVersionId,
    packageVersion: created.previewSession.packageVersion,
    capabilities: created.previewSession.capabilities,
    snapshotRoot: created.previewSession.snapshotRoot,
    entrypointPath: created.previewSession.entrypointPath,
    contentPath: resolvePreviewRuntimeContentPath(input.packageVersion),
    services: {
      ags: null,
      nrps: null,
    },
    launch: {
      userRole: created.previewSession.launch.userRole,
      courseId: created.previewSession.launch.courseId,
      ...(created.previewSession.launch.assignmentId === null
        ? {}
        : { assignmentId: created.previewSession.launch.assignmentId }),
      activityId: created.previewSession.launch.activityId,
    },
    preview: {
      previewSessionId: created.previewSession.sessionId,
    },
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PREVIEW_RUNTIME_SESSION_TTL_MS)
      .toISOString(),
  });

  await input.repository.appendPreviewEvidence({
    previewSessionId: created.previewSession.sessionId,
    eventType: "preview.launch",
    capability: null,
    summary: "Launched reviewed preview runtime session.",
    detail: {
      runtimeSessionId: runtimeSession.sessionId,
      route:
        `/admin/packages/${created.previewSession.appId}/versions/${created.previewSession.packageVersion}/preview`,
    },
    occurredAt: createdAt.toISOString(),
  });

  return {
    previewSession: created.previewSession,
    runtimeSession,
  };
}

export async function preparePreviewSession(input: {
  packageVersion: PackageVersionRecord;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<PreviewSessionRecord> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const packageVersion = input.packageVersion;

  if (packageVersion.approvalStatus !== "approved") {
    throw new Error(
      `Preview requires an approved package version. Found ${packageVersion.appId}@${packageVersion.version} in ${packageVersion.approvalStatus} state.`,
    );
  }

  const fixtureData = await loadPreviewFixtureData(packageVersion);
  const createdAt = now().toISOString();
  const sessionId = `preview-session-${createOpaqueToken()}`;
  const launchUserId = `preview-user-${createOpaqueToken()}`;

  return {
    sessionId,
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
    capabilities: packageVersion.capabilities,
    snapshotRoot: packageVersion.artifact.snapshotRoot,
    entrypointPath: packageVersion.artifact.entrypointPath,
    launch: {
      userId: launchUserId,
      userRole: fixtureData.launch.user_role,
      courseId: fixtureData.launch.course_id,
      assignmentId: fixtureData.launch.assignment_id,
      activityId: fixtureData.launch.activity_id,
    },
    fakeAttemptId: fixtureData.attempt_id,
    fakeScoreMaximum: packageVersion.grading.maxScore ?? 100,
    fixtureData,
    createdAt,
  };
}

async function loadPreviewFixtureData(
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
      throw new Error(
        `Preview fixtures file ${fixturesFile} is missing from reviewed snapshot.`,
      );
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw new Error(
      `Preview fixtures file ${fixturesFile} must be valid JSON.`,
    );
  }

  return parsePreviewFixtureData(parsed);
}

function readFixturesFilePath(manifestJson: Record<string, unknown>): string {
  const previewConfig = asRecord(manifestJson.preview);

  if (!previewConfig) {
    throw new Error(
      "Preview fixtures are required in manifest preview.fixtures_file.",
    );
  }

  const fixturesFile = requireString(
    previewConfig.fixtures_file,
    "Preview manifest preview.fixtures_file must be a non-empty string.",
  );

  if (!fixturesFile.startsWith("/preview/")) {
    throw new Error(
      "Preview manifest preview.fixtures_file must stay under /preview.",
    );
  }

  return fixturesFile;
}

function parsePreviewFixtureData(value: unknown): PreviewFixtureData {
  const fixture = requireRecord(
    value,
    "Preview fixtures must be a JSON object.",
  );
  const launch = requireRecord(
    fixture.launch,
    "Preview fixtures launch object is required.",
  );
  const userRole = requireUserRole(
    launch.user_role,
    "Preview fixtures launch.user_role is required.",
  );
  const courseId = requireString(
    launch.course_id,
    "Preview fixtures launch.course_id is required.",
  );
  const assignmentId = parseOptionalString(
    launch.assignment_id,
    "Preview fixtures launch.assignment_id must be a string or null.",
  );
  const activityId = requireString(
    launch.activity_id,
    "Preview fixtures launch.activity_id is required.",
  );
  const attemptId = requireString(
    fixture.attempt_id,
    "Preview fixtures attempt_id is required.",
  );
  const localState = parseLocalState(
    fixture.local_state,
  );

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

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Preview fixtures local_state must be an object or null.");
  }

  return value as Record<string, unknown>;
}

function resolveSnapshotPath(snapshotRoot: string, filePath: string): string {
  const relativePath = trimLeadingSlash(filePath);
  const absolutePath = joinSnapshotPath(snapshotRoot, relativePath);

  assertPathInsideSnapshot(snapshotRoot, absolutePath);

  return absolutePath;
}

function resolvePreviewRuntimeContentPath(
  packageVersion: PackageVersionRecord,
): string {
  const canonicalContentPath = readCanonicalContentPath(packageVersion);

  return `${packageVersion.artifact.snapshotRoot}${
    ensureLeadingSlash(canonicalContentPath)
  }`;
}

function readCanonicalContentPath(
  packageVersion: PackageVersionRecord,
): string {
  const contentFiles = readTrimmedStringArray(
    packageVersion.manifestJson.content_files,
  );

  return contentFiles[0] ?? "/content/activity.json";
}

function readTrimmedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function trimLeadingSlash(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

function joinSnapshotPath(snapshotRoot: string, relativePath: string): string {
  const root = normalizeFilePath(snapshotRoot);
  const relative = normalizeFilePath(relativePath);

  return relative === "" ? root : `${root}/${relative}`;
}

function assertPathInsideSnapshot(
  snapshotRoot: string,
  targetPath: string,
): void {
  const normalizedRoot = normalizeFilePath(snapshotRoot);
  const normalizedTarget = normalizeFilePath(targetPath);

  if (
    normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error(
      "Preview fixture path must stay inside the reviewed snapshot.",
    );
  }
}

function normalizeFilePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(
          "Preview fixture path must stay inside the reviewed snapshot.",
        );
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return `${isAbsolute ? "/" : ""}${segments.join("/")}`;
}

function requireRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function parseOptionalString(value: unknown, message: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(message);
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requireUserRole(value: unknown, message: string): UserRole {
  const role = requireString(value, message);

  if (role !== "learner" && role !== "instructor") {
    throw new Error(
      "Preview fixtures launch.user_role must be learner or instructor.",
    );
  }

  return role;
}

function defaultOpaqueToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
