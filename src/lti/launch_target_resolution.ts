import type { PackageReviewRepository } from "../package_review/repository.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";
import { ensureLeadingSlash } from "../package_review/snapshot_path.ts";
import { requireRecordClaim, requireStringClaim } from "./claim_support.ts";
import {
  rejectLaunchPackageVersionMissing,
  rejectMissingPinnedPackageVersion,
  rejectPackageNotApproved,
  rejectReviewedPlacementContextMismatch,
  rejectReviewedPlacementDeploymentMismatch,
  rejectReviewedPlacementNotFound,
  rejectReviewedPlacementResourceLinkConflict,
} from "./launch_support_matrix.ts";
import { LANTERN_PLACEMENT_CUSTOM_KEY } from "./types.ts";

export async function resolveLaunchTarget(input: {
  repository: PackageReviewRepository;
  deployment: {
    id: number;
    slug: string;
    appId: string;
    enabledPackageVersionId: number | null;
  };
  resourceLinkId: string;
  contextId: string;
  customClaim: unknown;
  now: () => Date;
}): Promise<{
  packageVersion: PackageVersionRecord;
  activityId: string;
  contentPath: string;
}> {
  const placementId = readReviewedPlacementId(input.customClaim);

  if (placementId === null) {
    return await resolvePinnedLaunchTarget(input);
  }

  const placement = await input.repository.getReviewedPlacementById(
    placementId,
  );

  if (!placement) {
    rejectReviewedPlacementNotFound(placementId);
  }

  if (
    placement.deploymentRecordId !== input.deployment.id ||
    placement.deploymentSlug !== input.deployment.slug ||
    placement.appId !== input.deployment.appId
  ) {
    rejectReviewedPlacementDeploymentMismatch({
      placementId,
      deploymentSlug: input.deployment.slug,
      placementDeploymentSlug: placement.deploymentSlug,
    });
  }

  if (placement.contextId !== input.contextId) {
    rejectReviewedPlacementContextMismatch({
      placementId,
      contextId: input.contextId,
      placementContextId: placement.contextId,
    });
  }

  if (
    placement.resourceLinkId !== null &&
    placement.resourceLinkId !== input.resourceLinkId
  ) {
    rejectReviewedPlacementResourceLinkConflict({
      placementId,
      resourceLinkId: input.resourceLinkId,
      existingResourceLinkId: placement.resourceLinkId,
    });
  }

  let boundPlacement;

  try {
    boundPlacement = await input.repository.bindReviewedPlacementResourceLink({
      placementId,
      resourceLinkId: input.resourceLinkId,
      boundAt: input.now().toISOString(),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("already bound to another reviewed placement")
    ) {
      rejectReviewedPlacementResourceLinkConflict({
        placementId,
        resourceLinkId: input.resourceLinkId,
        deploymentSlug: placement.deploymentSlug,
      });
    }

    throw error;
  }
  const packageVersion = await requireApprovedLaunchPackageVersion({
    repository: input.repository,
    packageVersionId: boundPlacement.packageVersionId,
  });

  if (packageVersion.appId !== boundPlacement.appId) {
    throw new Error(
      `Reviewed placement ${placementId} resolved to the wrong app package ${packageVersion.appId}.`,
    );
  }

  return {
    packageVersion,
    activityId: boundPlacement.activityId,
    contentPath: boundPlacement.contentPath,
  };
}

async function resolvePinnedLaunchTarget(input: {
  repository: PackageReviewRepository;
  deployment: {
    slug: string;
    enabledPackageVersionId: number | null;
  };
  resourceLinkId: string;
}): Promise<{
  packageVersion: PackageVersionRecord;
  activityId: string;
  contentPath: string;
}> {
  if (input.deployment.enabledPackageVersionId === null) {
    rejectMissingPinnedPackageVersion(input.deployment.slug);
  }

  const packageVersion = await requireApprovedLaunchPackageVersion({
    repository: input.repository,
    packageVersionId: input.deployment.enabledPackageVersionId,
  });

  return {
    packageVersion,
    activityId: input.resourceLinkId,
    contentPath: resolveCanonicalContentPath(packageVersion),
  };
}

async function requireApprovedLaunchPackageVersion(input: {
  repository: PackageReviewRepository;
  packageVersionId: number;
}): Promise<PackageVersionRecord> {
  const packageVersion = await input.repository.getPackageVersionById(
    input.packageVersionId,
  );

  if (!packageVersion) {
    rejectLaunchPackageVersionMissing(input.packageVersionId);
  }

  if (packageVersion.approvalStatus !== "approved") {
    rejectPackageNotApproved({
      appId: packageVersion.appId,
      packageVersion: packageVersion.version,
    });
  }

  return packageVersion;
}

function readReviewedPlacementId(customClaim: unknown): string | null {
  const custom = customClaim === undefined ? null : requireRecordClaim(
    customClaim,
    "Launch custom claim must be an object when provided.",
  );

  if (!custom || custom[LANTERN_PLACEMENT_CUSTOM_KEY] === undefined) {
    return null;
  }

  return requireStringClaim(
    custom[LANTERN_PLACEMENT_CUSTOM_KEY],
    `Launch custom.${LANTERN_PLACEMENT_CUSTOM_KEY} is required when provided.`,
  );
}

function resolveCanonicalContentPath(
  packageVersion: PackageVersionRecord,
): string {
  const contentFiles = Array.isArray(packageVersion.manifestJson.content_files)
    ? packageVersion.manifestJson.content_files
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item !== "")
    : [];
  const firstContentFile = contentFiles[0];

  return ensureLeadingSlash(firstContentFile ?? "/content/activity.json");
}
