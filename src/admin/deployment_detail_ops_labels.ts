import type {
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthStatus,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  InternalBrokerVerificationStatus,
} from "../ops/types.ts";

export function describeSmokeStatus(
  snapshot: DeploymentActivitySnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not run yet";
  }

  switch (snapshot.status) {
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "notRun":
      return "Not run yet";
  }
}

export function describeSmokeCapability(
  snapshot: DeploymentActivitySnapshot | null | undefined,
  readBooleanDetail: (
    detail: Record<string, unknown> | null | undefined,
    key: string,
  ) => boolean | null,
): string {
  const agsCapable = readBooleanDetail(snapshot?.detail, "agsCapable");

  if (agsCapable === true) {
    return "Available";
  }

  if (agsCapable === false) {
    return "Missing";
  }

  return "Not checked yet";
}

export function describeSmokeCapabilitySummary(
  snapshot: DeploymentActivitySnapshot | null | undefined,
  readBooleanDetail: (
    detail: Record<string, unknown> | null | undefined,
    key: string,
  ) => boolean | null,
): string {
  const agsCapable = readBooleanDetail(snapshot?.detail, "agsCapable");

  if (agsCapable === true) {
    return "Launch-scoped grade return access was available for this saved setup.";
  }

  if (agsCapable === false) {
    return "This saved setup did not expose the grade return access Lantern needs for this check.";
  }

  return "This check has not inspected grade return access for this setup yet.";
}

export function describeSmokePublication(
  snapshot: DeploymentActivitySnapshot | null | undefined,
  readStringDetail: (
    detail: Record<string, unknown> | null | undefined,
    key: string,
  ) => string | null,
): string {
  const publicationStatus = readStringDetail(
    snapshot?.detail,
    "publicationStatus",
  );

  switch (publicationStatus) {
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "not_attempted":
      return "Not attempted";
    default:
      return "Not checked yet";
  }
}

export function describeSmokePublicationSummary(
  snapshot: DeploymentActivitySnapshot | null | undefined,
  readStringDetail: (
    detail: Record<string, unknown> | null | undefined,
    key: string,
  ) => string | null,
): string {
  const publicationStatus = readStringDetail(
    snapshot?.detail,
    "publicationStatus",
  );

  switch (publicationStatus) {
    case "succeeded":
      return "Lantern completed a test grade write for this setup.";
    case "failed":
      return "Lantern reached the test grade write step, but the write failed.";
    case "not_attempted":
      return "Lantern stopped before the test grade write step.";
    default:
      return "No test grade write result has been recorded for this setup yet.";
  }
}

export function describeGradePublication(
  snapshot: DeploymentGradePublicationSnapshot,
): string {
  switch (snapshot.status) {
    case "published":
      return "Latest grade publish succeeded.";
    case "pending":
      return "Latest grade publish is still pending.";
    case "failed":
      return "Latest grade publish failed and may need retry.";
  }
}

export function describeBrokerVerificationStatus(
  status: InternalBrokerVerificationStatus["status"] | null,
): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "notRun":
    case null:
      return "Not recorded yet";
  }
}

export function describeOverallStatus(
  status: ControlPlaneHealthStatus | null,
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs follow-up";
    case "failed":
      return "Failed";
    case "unknown":
    case null:
      return "Not recorded yet";
  }
}

export function formatLmsLabel(lms: "canvas" | "moodle" | "sakai"): string {
  switch (lms) {
    case "canvas":
      return "Canvas";
    case "moodle":
      return "Moodle";
    case "sakai":
      return "Sakai";
  }
}

export function describeDiagnosticKind(
  kind: ControlPlaneDiagnosticItem["kind"],
): string {
  switch (kind) {
    case "launch":
      return "Launch";
    case "nrps":
      return "Roster read";
    case "brokerVerification":
      return "Compatibility result";
    case "reviewer":
      return "Reviewer action";
    case "gradePublication":
      return "Grade write";
  }
}

export function describeDiagnosticStatus(
  item: ControlPlaneDiagnosticItem,
): string {
  if (item.retryable) {
    return "Retry available";
  }

  return item.status === "failed" ? "Failed" : "Recorded";
}

export function describeProblemSummary(problemCount: number): string {
  if (problemCount === 0) {
    return "None right now";
  }

  if (problemCount === 1) {
    return "1 to review";
  }

  return `${problemCount} to review`;
}
