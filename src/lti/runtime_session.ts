import type { PackageVersionRecord } from "../package_review/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import { ensureLeadingSlash } from "../package_review/snapshot_path.ts";
import { requireTrimmedValue } from "./claim_support.ts";
import { createOpaqueToken } from "./token_support.ts";
import type { RuntimeSessionRecord, ValidatedLaunch } from "./types.ts";

const RUNTIME_SESSION_TTL_MS = 10 * 60 * 1000;

export async function createRuntimeSession(input: {
  repository: PackageReviewRepository;
  launch: ValidatedLaunch;
  now?: () => Date;
  createOpaqueToken?: () => string;
}): Promise<RuntimeSessionRecord> {
  const now = input.now ?? (() => new Date());
  const nextOpaqueToken = input.createOpaqueToken ?? createOpaqueToken;
  const packageVersion = await input.repository.getPackageVersionById(
    input.launch.packageVersionId,
  );

  if (!packageVersion) {
    throw new Error(
      `Launch package version id ${input.launch.packageVersionId} was not found.`,
    );
  }

  if (packageVersion.approvalStatus !== "approved") {
    throw new Error(
      `Launch package version ${packageVersion.appId}@${packageVersion.version} is not approved.`,
    );
  }

  const createdAt = now();
  const attempt = await input.repository.createAttempt({
    attemptId: input.launch.attemptId,
    deploymentRecordId: input.launch.internalDeploymentId,
    deploymentSlug: input.launch.internalDeploymentSlug,
    appId: packageVersion.appId,
    packageVersionId: packageVersion.id,
    packageVersion: packageVersion.version,
    userId: input.launch.userId,
    userDisplayName: input.launch.userDisplayName,
    userEmail: input.launch.userEmail,
    userLogin: input.launch.userLogin,
    userRole: input.launch.userRole,
    contextId: requireTrimmedValue(
      input.launch.contextId ?? "",
      "Launch context.id is required for the governed runtime.",
    ),
    resourceLinkId: input.launch.resourceLinkId,
    activityId: input.launch.activityId,
    status: "in_progress",
    completionState: null,
    startedAt: createdAt.toISOString(),
    finalizedAt: null,
  });

  return await input.repository.createRuntimeSession({
    sessionId: nextOpaqueToken(),
    sessionToken: nextOpaqueToken(),
    attemptId: attempt.attemptId,
    deploymentRecordId: input.launch.internalDeploymentId,
    deploymentSlug: input.launch.internalDeploymentSlug,
    appId: packageVersion.runtimeContract.appId,
    packageVersionId: packageVersion.id,
    packageVersion: packageVersion.runtimeContract.packageVersion,
    capabilities: packageVersion.runtimeContract.capabilities,
    snapshotRoot: packageVersion.artifact.snapshotRoot,
    entrypointPath: `${packageVersion.artifact.snapshotRoot}${
      ensureLeadingSlash(packageVersion.runtimeContract.entrypoint)
    }`,
    contentPath: resolveRuntimeContentPath(
      packageVersion,
      input.launch.contentPath,
    ),
    services: input.launch.services,
    launch: {
      userRole: input.launch.userRole,
      courseId: requireTrimmedValue(
        input.launch.contextId ?? "",
        "Launch context.id is required for the governed runtime.",
      ),
      activityId: input.launch.activityId,
    },
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + RUNTIME_SESSION_TTL_MS)
      .toISOString(),
  });
}

function resolveRuntimeContentPath(
  packageVersion: PackageVersionRecord,
  contentPath: string,
): string {
  return `${packageVersion.artifact.snapshotRoot}${
    ensureLeadingSlash(contentPath)
  }`;
}
