import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  AttemptRecord,
  PackageVersionRecord,
  PreviewSessionRecord,
} from '../package_review/types.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';

export async function resolvePreviewSession(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<PreviewSessionRecord> {
  const previewSession = await repository.getPreviewSessionById(session.preview.previewSessionId);

  if (previewSession === null) {
    throw new Error(`Preview session ${session.preview.previewSessionId} was not found.`);
  }

  if (
    previewSession.appId !== session.appId ||
    previewSession.packageVersionId !== session.packageVersionId ||
    previewSession.packageVersion !== session.packageVersion ||
    !matchesPreviewAttemptId(session.attemptId, previewSession)
  ) {
    throw new Error(
      `Preview session ${previewSession.sessionId} did not match the runtime session context.`,
    );
  }

  return previewSession;
}

export function previewSessionHasLiveServicePath(session: RuntimeSessionRecord): boolean {
  return session.services.ags !== null || session.services.nrps !== null;
}

export async function requireRuntimeAttempt(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<AttemptRecord> {
  const attempt = await repository.getAttemptById(session.attemptId);

  if (!attempt) {
    throw new Error(`Attempt ${session.attemptId} was not found.`);
  }

  if (
    attempt.previewSessionId !== session.preview.previewSessionId ||
    attempt.packageVersionId !== session.packageVersionId ||
    attempt.appId !== session.appId
  ) {
    throw new Error(`Attempt ${attempt.attemptId} did not match the runtime session context.`);
  }

  return attempt;
}

export async function requireRuntimePackageVersion(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<PackageVersionRecord> {
  const packageVersion = await repository.getPackageVersionById(session.packageVersionId);

  if (!packageVersion) {
    throw new Error(`Package version ${session.packageVersionId} was not found for finalize.`);
  }

  if (packageVersion.appId !== session.appId || packageVersion.version !== session.packageVersion) {
    throw new Error(
      `Package version ${session.packageVersionId} did not match the runtime session context.`,
    );
  }

  return packageVersion;
}

function matchesPreviewAttemptId(attemptId: string, previewSession: PreviewSessionRecord): boolean {
  return (
    attemptId === previewSession.fakeAttemptId ||
    attemptId === `${previewSession.fakeAttemptId}:${previewSession.sessionId}`
  );
}
