import type {
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
} from "../package_review/types.ts";
import type { DeepLinkingSessionRecord } from "./types.ts";
import { requireStringClaim, requireTrimmedValue } from "./claim_support.ts";

export function buildDeepLinkingSelectionValue(input: {
  packageVersionId: number;
  contentPath: string;
}): string {
  return JSON.stringify({
    packageVersionId: input.packageVersionId,
    contentPath: normalizeContentPath(input.contentPath),
  });
}

export function resolveDeepLinkingSelection(input: {
  session: DeepLinkingSessionRecord;
  resources: DeepLinkingResourceOption[];
}): DeepLinkingResourceSelection | null {
  const sessionSelection = input.session.selection;

  if (sessionSelection === null) {
    return null;
  }

  const resource = input.resources.find(
    (candidate) =>
      candidate.packageVersionId === sessionSelection.packageVersionId &&
      candidate.contentPath === sessionSelection.contentPath,
  );

  if (!resource) {
    return null;
  }

  return {
    packageVersionId: resource.packageVersionId,
    packageVersion: resource.packageVersion,
    packageTitle: resource.packageTitle,
    activityId: resource.activityId,
    contentPath: resource.contentPath,
    contentTitle: resource.contentTitle,
  };
}

export function normalizeDeepLinkingSelectionInput(input: {
  selectionValue: string;
  resources: DeepLinkingResourceOption[];
}): DeepLinkingResourceSelection {
  const selectionValue = requireTrimmedValue(
    input.selectionValue,
    "Choose one reviewed resource before continuing.",
  );
  let payload: unknown;

  try {
    payload = JSON.parse(selectionValue);
  } catch {
    throw new Error("Deep Linking selection payload was invalid.");
  }

  const record = requireSelectionRecord(payload);
  const packageVersionId = parseSelectionPackageVersionId(
    record.packageVersionId,
  );
  const contentPath = normalizeContentPath(
    requireStringClaim(
      record.contentPath,
      "Deep Linking selection content path is required.",
    ),
  );
  const resource = input.resources.find(
    (candidate) =>
      candidate.packageVersionId === packageVersionId &&
      candidate.contentPath === contentPath,
  );

  if (!resource) {
    throw new Error(
      `Deep Linking selection ${packageVersionId} ${contentPath} is not approved for this app.`,
    );
  }

  return {
    packageVersionId: resource.packageVersionId,
    packageVersion: resource.packageVersion,
    packageTitle: resource.packageTitle,
    activityId: resource.activityId,
    contentPath: resource.contentPath,
    contentTitle: resource.contentTitle,
  };
}

function requireSelectionRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Deep Linking selection payload was invalid.");
  }

  return value as Record<string, unknown>;
}

function parseSelectionPackageVersionId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  throw new Error("Deep Linking selection package version is required.");
}

function normalizeContentPath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}
