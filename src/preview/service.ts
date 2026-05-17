import { resolveSubmissionMode } from '../../sdk/app-sdk.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import {
  assertPathInsideSnapshot,
  ensureLeadingSlash,
  joinSnapshotPath,
  trimLeadingSlash,
} from '../package_review/snapshot_path.ts';
import type { PackageVersionRecord, PreviewSessionRecord } from '../package_review/types.ts';
import type { RuntimeArtifactStore } from '../runtime/artifact_store.ts';
import { loadPreviewFixtureData, resolvePreviewContentPath } from './fixture.ts';

export interface PreviewFakeScoringDefaults {
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress: 'Completed';
  gradingProgress: 'FullyGraded';
}

export interface CreatedPreviewSession {
  previewSession: PreviewSessionRecord;
  fakeScoring: PreviewFakeScoringDefaults;
}

export interface PreviewLaunchOverrides {
  userRole?: PreviewSessionRecord['launch']['userRole'];
  courseId?: string;
  assignmentId?: string | null;
  activityId?: string;
  contentPath?: string;
}

export async function createPreviewSession(input: {
  repository: PackageReviewRepository;
  packageVersion: PackageVersionRecord;
  artifactStore: RuntimeArtifactStore;
  launch?: PreviewLaunchOverrides | null;
  previewOrigin?: PreviewSessionRecord['origin'];
  deepLinkingSessionId?: string | null;
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
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
    },
  };
}

const PREVIEW_RUNTIME_SESSION_TTL_MS = 10 * 60 * 1000;

export async function launchPreviewRuntimeSession(input: {
  repository: PackageReviewRepository;
  packageVersion: PackageVersionRecord;
  artifactStore: RuntimeArtifactStore;
  launch?: PreviewLaunchOverrides | null;
  previewOrigin?: PreviewSessionRecord['origin'];
  deepLinkingSessionId?: string | null;
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
    artifactStore: input.artifactStore,
    launch: input.launch ?? null,
    ...(input.previewOrigin === undefined ? {} : { previewOrigin: input.previewOrigin }),
    ...(input.deepLinkingSessionId === undefined
      ? {}
      : { deepLinkingSessionId: input.deepLinkingSessionId }),
    now,
    createOpaqueToken,
  });
  const previewDeployment = await input.repository.pinDeploymentVersion({
    slug: buildPreviewDeploymentSlug(created.previewSession.appId),
    label: buildPreviewDeploymentLabel(created.previewSession.packageTitle),
    appId: created.previewSession.appId,
    packageVersionId: created.previewSession.packageVersionId,
    lmsType: 'preview',
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
    userDisplayName: null,
    userEmail: null,
    userLogin: null,
    userRole: created.previewSession.launch.userRole,
    contextId: created.previewSession.launch.courseId,
    resourceLinkId: `preview-resource-${created.previewSession.sessionId}`,
    activityId: created.previewSession.launch.activityId,
    status: 'in_progress',
    completionState: null,
    localState: null,
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
    contentPath: resolvePreviewRuntimeContentPath(
      created.previewSession.snapshotRoot,
      created.previewSession.contentPath,
    ),
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
      submissionMode: resolveSubmissionMode(created.previewSession.capabilities),
    },
    preview: {
      previewSessionId: created.previewSession.sessionId,
    },
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PREVIEW_RUNTIME_SESSION_TTL_MS).toISOString(),
  });

  await input.repository.appendPreviewEvidence({
    previewSessionId: created.previewSession.sessionId,
    eventType: 'preview.launch',
    capability: null,
    summary: buildPreviewLaunchSummary(created.previewSession),
    detail: buildPreviewLaunchDetail(created.previewSession, runtimeSession.sessionId),
    occurredAt: createdAt.toISOString(),
  });

  return {
    previewSession: created.previewSession,
    runtimeSession,
  };
}

function buildPreviewRuntimeAttemptId(previewSession: PreviewSessionRecord): string {
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
  artifactStore: RuntimeArtifactStore;
  launch?: PreviewLaunchOverrides | null;
  previewOrigin?: PreviewSessionRecord['origin'];
  deepLinkingSessionId?: string | null;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<PreviewSessionRecord> {
  const now = input.now ?? (() => new Date());
  const createOpaqueToken = input.createOpaqueToken ?? defaultOpaqueToken;
  const packageVersion = input.packageVersion;

  if (packageVersion.approvalStatus === 'rejected') {
    throw new Error(
      `Test launch is unavailable for rejected package version ${packageVersion.appId}@${packageVersion.version}.`,
    );
  }

  const fixtureData = await loadPreviewFixtureData(packageVersion, input.artifactStore);
  const origin = input.previewOrigin ?? 'adminTestLaunch';
  const contentPath = await resolvePreparedPreviewContentPath(
    packageVersion,
    input.artifactStore,
    input.launch?.contentPath,
  );
  const createdAt = now().toISOString();
  const sessionId = `preview-session-${createOpaqueToken()}`;
  const launchUserId = `preview-user-${createOpaqueToken()}`;
  const launch = resolvePreviewLaunch(packageVersion, fixtureData, input.launch);

  return {
    sessionId,
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
    origin,
    contentPath,
    deepLinkingSessionId: input.deepLinkingSessionId ?? null,
    capabilities: packageVersion.capabilities,
    snapshotRoot: packageVersion.artifact.snapshotRoot,
    entrypointPath: packageVersion.artifact.entrypointPath,
    launch: {
      userId: launchUserId,
      userRole: launch.userRole,
      courseId: launch.courseId,
      assignmentId: launch.assignmentId,
      activityId: launch.activityId,
    },
    fakeAttemptId: fixtureData.attempt_id,
    fakeScoreMaximum: packageVersion.grading.maxScore ?? 100,
    fixtureData,
    createdAt,
  };
}

function defaultOpaqueToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

function resolvePreviewLaunch(
  packageVersion: PackageVersionRecord,
  fixtureData: PreviewSessionRecord['fixtureData'],
  overrides: PreviewLaunchOverrides | null | undefined,
): Omit<PreviewSessionRecord['launch'], 'userId'> {
  const userRole = overrides?.userRole ?? fixtureData.launch.user_role;

  if (!packageVersion.roles.includes(userRole)) {
    throw new Error(`Test launch role ${userRole} is not allowed for this app version.`);
  }

  return {
    userRole,
    courseId: requireTestLaunchValue(
      overrides?.courseId ?? fixtureData.launch.course_id,
      'Test launch course ID is required.',
    ),
    assignmentId: normalizeOptionalTestLaunchValue(
      overrides?.assignmentId === undefined
        ? fixtureData.launch.assignment_id
        : overrides.assignmentId,
    ),
    activityId: requireTestLaunchValue(
      overrides?.activityId ?? fixtureData.launch.activity_id,
      'Test launch activity ID is required.',
    ),
  };
}

function requireTestLaunchValue(value: string, message: string): string {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalTestLaunchValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function resolvePreparedPreviewContentPath(
  packageVersion: PackageVersionRecord,
  artifactStore: RuntimeArtifactStore,
  overrideContentPath: string | undefined,
): Promise<string> {
  if (overrideContentPath === undefined) {
    return await resolvePreviewContentPath(packageVersion, artifactStore);
  }

  const trimmed = overrideContentPath.trim();

  if (trimmed === '') {
    throw new Error('Preview content path is required.');
  }

  return ensureLeadingSlash(trimmed);
}

function resolvePreviewRuntimeContentPath(snapshotRoot: string, contentPath: string): string {
  const outsideMessage = 'Preview content path must stay inside the reviewed app files.';
  const absolutePath = joinSnapshotPath(
    snapshotRoot,
    trimLeadingSlash(contentPath),
    outsideMessage,
  );

  assertPathInsideSnapshot(snapshotRoot, absolutePath, outsideMessage);

  return absolutePath;
}

function buildPreviewLaunchSummary(previewSession: PreviewSessionRecord): string {
  return previewSession.origin === 'deepLinkingAuthoring' ||
    previewSession.origin === 'adminAuthoringDraft'
    ? "Started an authoring preview in Lantern's runtime."
    : "Started a test launch in Lantern's runtime.";
}

function buildPreviewLaunchDetail(
  previewSession: PreviewSessionRecord,
  runtimeSessionId: string,
): Record<string, unknown> {
  return {
    runtimeSessionId,
    origin: previewSession.origin,
    contentPath: previewSession.contentPath,
    deepLinkingSessionId: previewSession.deepLinkingSessionId,
    route:
      previewSession.origin === 'deepLinkingAuthoring'
        ? previewSession.deepLinkingSessionId === null
          ? null
          : `/lti/deep-linking/sessions/${previewSession.deepLinkingSessionId}/preview`
        : previewSession.origin === 'adminAuthoringDraft'
          ? `/admin/packages/${previewSession.appId}/versions/${previewSession.packageVersion}/authoring`
          : `/admin/packages/${previewSession.appId}/versions/${previewSession.packageVersion}/preview`,
  };
}
