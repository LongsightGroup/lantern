import type { RuntimeSessionRecord } from "../lti/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  PackageVersionRecord,
  PreviewSessionRecord,
} from "../package_review/types.ts";
import {
  loadPreviewFixtureData,
  resolvePreviewRuntimeContentPath,
} from "./fixture.ts";

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
  const previewDeployment = await input.repository.pinDeploymentVersion({
    slug: buildPreviewDeploymentSlug(created.previewSession.appId),
    label: buildPreviewDeploymentLabel(created.previewSession.packageTitle),
    appId: created.previewSession.appId,
    packageVersionId: created.previewSession.packageVersionId,
    lmsType: "preview",
  });
  const runtimeAttemptId = buildPreviewRuntimeAttemptId(created.previewSession);

  await input.repository.createAttempt({
    attemptId: runtimeAttemptId,
    deploymentRecordId: previewDeployment.id,
    deploymentSlug: previewDeployment.slug,
    appId: created.previewSession.appId,
    packageVersionId: created.previewSession.packageVersionId,
    packageVersion: created.previewSession.packageVersion,
    userId: created.previewSession.launch.userId,
    userRole: created.previewSession.launch.userRole,
    contextId: created.previewSession.launch.courseId,
    resourceLinkId: `preview-resource-${created.previewSession.sessionId}`,
    activityId: created.previewSession.launch.activityId,
    status: "in_progress",
    completionState: null,
    startedAt: createdAt.toISOString(),
    finalizedAt: null,
  });

  const runtimeSession = await input.repository.createRuntimeSession({
    sessionId: `preview-runtime-${createOpaqueToken()}`,
    sessionToken: createOpaqueToken(),
    attemptId: runtimeAttemptId,
    deploymentRecordId: previewDeployment.id,
    deploymentSlug: previewDeployment.slug,
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

function buildPreviewRuntimeAttemptId(
  previewSession: PreviewSessionRecord,
): string {
  return `${previewSession.fakeAttemptId}:${previewSession.sessionId}`;
}

function buildPreviewDeploymentSlug(appId: string): string {
  return `${appId}-preview`;
}

function buildPreviewDeploymentLabel(packageTitle: string): string {
  return `${packageTitle} Preview`;
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

function defaultOpaqueToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
