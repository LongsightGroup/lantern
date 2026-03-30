import type { LtiPlacement } from "../lti/types.ts";
import { compare, parse } from "@std/semver";
import type {
  DeepLinkingResourceOption,
  PackageVersionRecord,
} from "./types.ts";

export function sortPackageVersions(
  records: PackageVersionRecord[],
): PackageVersionRecord[] {
  return [...records].sort((left, right) => {
    if (left.appId !== right.appId) {
      return left.appId.localeCompare(right.appId);
    }

    const versionComparison = compare(
      parse(right.version),
      parse(left.version),
    );

    if (versionComparison !== 0) {
      return versionComparison;
    }

    return right.importedAt.localeCompare(left.importedAt);
  });
}

export function buildDeepLinkingResourceOptions(
  versions: PackageVersionRecord[],
  placement: LtiPlacement,
): DeepLinkingResourceOption[] {
  const installScope = placement === "assignment_selection"
    ? "assignment"
    : "course";

  return versions.flatMap((version) => {
    if (
      version.installScope !== installScope ||
      version.approvalStatus !== "approved" ||
      version.reviewedAt === null
    ) {
      return [];
    }

    return readCanonicalContentFiles(version.manifestJson).map((
      contentPath,
    ) => ({
      packageVersionId: version.id,
      appId: version.appId,
      packageVersion: version.version,
      packageTitle: version.title,
      ownerId: version.owner.id,
      installScope,
      approvalStatus: "approved",
      reviewedAt: version.reviewedAt,
      activityId: contentPath,
      contentPath,
      contentTitle: null,
    }));
  });
}

function readCanonicalContentFiles(
  manifestJson: Record<string, unknown>,
): string[] {
  const contentFiles = readStringArray(manifestJson.content_files);

  if (contentFiles.length === 0) {
    return ["/content/activity.json"];
  }

  return contentFiles.map(normalizeContentPath);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function normalizeContentPath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}
