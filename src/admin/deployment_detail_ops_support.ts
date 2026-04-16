import { describeResolvedLtiProfile } from "../lti/profile_resolution.ts";
import { isLtiProfileId } from "../lti/profile.ts";
import type {
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  ControlPlaneHealthStatus,
  ControlPlaneRuntimeEvidenceSnapshot,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  DeploymentRecentLaunch,
} from "../ops/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";
import {
  describeDiagnosticKind,
  describeDiagnosticStatus,
  describeRuntimeBoundary,
  describeRuntimeSandboxModel,
} from "./deployment_detail_ops_labels.ts";

export function renderActivityFact(
  label: string,
  value: string,
  summary: string,
): string {
  return `<div class="fact">
      <span class="fact-label">${escapeHtml(label)}</span>
      <span class="fact-value">${escapeHtml(value)}</span>
      <p class="micro muted">${escapeHtml(summary)}</p>
    </div>`;
}

export function renderDimensionRow(
  label: string,
  dimension: ControlPlaneHealthDimension | null,
): string {
  const tone = dimension?.status ?? "unknown";
  const status = dimension === null
    ? "Unknown"
    : describeDimensionStatus(dimension.status);
  const summary = dimension?.summary ??
    "No control-plane evidence has been recorded for this dimension yet.";
  const checkedAt =
    dimension?.checkedAt === null || dimension?.checkedAt === undefined
      ? "Not recorded yet"
      : formatDateTime(dimension.checkedAt);

  return `<article class="table-row table-row-status table-row-status-${
    escapeHtml(tone)
  }">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(label)}</span>
          <span class="chip chip-status chip-status-${escapeHtml(tone)}">${
    escapeHtml(
      status,
    )
  }</span>
        </p>
        <p class="micro muted">${escapeHtml(checkedAt)}</p>
      </div>
      <p class="line-copy">${escapeHtml(summary)}</p>
    </article>`;
}

export function renderDiagnosticRow(
  item: ControlPlaneDiagnosticItem,
  appId: string,
  retryAttemptId: string | null,
): string {
  const tone = describeDiagnosticTone(item);
  const request = describeDiagnosticRequest(item.detail);
  const details = [
    describeBoundaryDenialCategory(item.boundaryDenialCategory),
    describeRuntimeFact(
      item.kind === "runtime" ? readRuntimeSandboxModel(item.detail) : null,
      describeRuntimeSandboxModel,
    ),
    describeRuntimeFact(
      item.kind === "runtime" ? readRuntimeBoundary(item.detail) : null,
      describeRuntimeBoundary,
    ),
    describeActivityLtiProfile(item.detail),
    item.boundaryDenialCategory === null && item.code !== null
      ? `Code ${item.code}`
      : null,
    item.kind === "runtime"
      ? describeRuntimeRoute(readStringDetail(item.detail, "route"))
      : null,
    item.attemptId === null ? null : `Attempt ${item.attemptId}`,
  ].filter((value): value is string => value !== null);
  const retryAction = item.retryable && retryAttemptId !== null
    ? `<form method="post" action="/admin/packages/${
      escapeHtml(
        appId,
      )
    }/deployment/retry-grade-publish" class="stack">
            <input type="hidden" name="attemptId" value="${
      escapeHtml(retryAttemptId)
    }" />
            <div class="button-row">
              <button type="submit" class="button-secondary">Retry grade publish</button>
            </div>
          </form>`
    : "";

  return `<article class="table-row table-row-status table-row-status-${
    escapeHtml(tone)
  }">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(describeDiagnosticKind(item.kind))}</span>
          <span class="chip chip-status chip-status-${escapeHtml(tone)}">${
    escapeHtml(
      describeDiagnosticStatus(item),
    )
  }</span>
        </p>
        <p class="micro muted">${
    escapeHtml(formatDateTime(item.occurredAt))
  }</p>
      </div>
      <p class="line-copy">${escapeHtml(item.operatorSummary)}</p>
      ${
    details.length === 0
      ? ""
      : `<p class="micro muted">${escapeHtml(details.join(" · "))}</p>`
  }
      ${
    request === null ? "" : `<p class="micro muted">${escapeHtml(request)}</p>`
  }
      ${retryAction}
    </article>`;
}

export function renderRecentLaunchTableRow(
  item: DeploymentRecentLaunch,
): string {
  const identity = resolveLaunchIdentity(item);
  const launchContext = [
    item.contextId === null ? null : `Course or site ${item.contextId}`,
    item.resourceLinkId === null ? null : `Placement ${item.resourceLinkId}`,
  ].filter((value): value is string => value !== null);
  const launchDetails = [
    identity.secondary,
    formatResolvedLtiProfile({
      id: item.ltiProfileId,
      source: item.ltiProfileSource,
    }),
    item.attemptId === null ? null : `Attempt ${item.attemptId}`,
  ].filter((value): value is string => value !== null);
  const summary = launchContext.length === 0
    ? item.summary
    : launchContext.join(" · ");

  return `<tr>
      <td>
        <div class="detail-table-stack">
          <strong>${escapeHtml(identity.primary ?? "Unknown person")}</strong>
          ${
    identity.secondary === null
      ? ""
      : `<span class="micro muted">${escapeHtml(identity.secondary)}</span>`
  }
        </div>
      </td>
      <td>${escapeHtml(formatDateTime(item.occurredAt))}</td>
      <td>${escapeHtml(summary)}</td>
      <td>
        <div class="detail-table-stack">
          <span class="chip chip-status chip-status-healthy">Opened</span>
          ${
    launchDetails.length === 0
      ? ""
      : `<span class="micro muted">${
        escapeHtml(launchDetails.join(" · "))
      }</span>`
  }
        </div>
      </td>
    </tr>`;
}

function resolveLaunchIdentity(item: DeploymentRecentLaunch): {
  primary: string | null;
  secondary: string | null;
} {
  if (item.userDisplayName !== null) {
    return {
      primary: item.userDisplayName,
      secondary: item.userEmail ?? item.userLogin,
    };
  }

  if (item.userEmail !== null) {
    return {
      primary: item.userEmail,
      secondary: item.userLogin,
    };
  }

  if (item.userLogin !== null) {
    return {
      primary: item.userLogin,
      secondary: null,
    };
  }

  return {
    primary: item.userId === null ? null : normalizeOpaqueSubject(item.userId),
    secondary: null,
  };
}

function describeDiagnosticRequest(
  detail: Record<string, unknown>,
): string | null {
  const request = readRequestEnvelope(detail);

  if (request === null) {
    return null;
  }

  const facts = [
    `${request.method} ${request.path}`,
    request.host === null ? null : `Host ${request.host}`,
    request.queryKeys.length === 0
      ? null
      : `Query ${request.queryKeys.join(", ")}`,
    request.formKeys.length === 0
      ? null
      : `Form ${request.formKeys.join(", ")}`,
    request.bodyKeys.length === 0
      ? null
      : `Body ${request.bodyKeys.join(", ")}`,
    request.contentType === null ? null : request.contentType,
    request.contentLength === null ? null : `${request.contentLength} bytes`,
    request.userAgent === null ? null : `UA ${request.userAgent}`,
    request.clientIpMasked === null ? null : `IP ${request.clientIpMasked}`,
    request.cfRay === null ? null : `CF-Ray ${request.cfRay}`,
  ].filter((value): value is string => value !== null);

  if (facts.length === 0) {
    return null;
  }

  return `Request ${facts.join(" · ")}`;
}

function readRequestEnvelope(detail: Record<string, unknown>): {
  method: string;
  path: string;
  host: string | null;
  queryKeys: string[];
  formKeys: string[];
  bodyKeys: string[];
  contentType: string | null;
  contentLength: number | null;
  userAgent: string | null;
  clientIpMasked: string | null;
  cfRay: string | null;
} | null {
  const value = detail.request;

  if (!isRecord(value)) {
    return null;
  }

  const method = readStringDetail(value, "method");
  const path = readStringDetail(value, "path");

  if (method === null || path === null) {
    return null;
  }

  return {
    method,
    path,
    host: readStringDetail(value, "host"),
    queryKeys: readStringArrayDetail(value, "queryKeys"),
    formKeys: readStringArrayDetail(value, "formKeys"),
    bodyKeys: readStringArrayDetail(value, "bodyKeys"),
    contentType: readStringDetail(value, "contentType"),
    contentLength: readNumberDetail(value, "contentLength"),
    userAgent: readStringDetail(value, "userAgent"),
    clientIpMasked: readStringDetail(value, "clientIpMasked"),
    cfRay: readStringDetail(value, "cfRay"),
  };
}

function normalizeOpaqueSubject(value: string): string {
  try {
    const url = new URL(value);
    const pathSegments = url.pathname.split("/").filter((segment) =>
      segment.length > 0
    );
    const lastSegment = pathSegments.at(-1);

    return lastSegment === undefined ? value : lastSegment;
  } catch {
    return value;
  }
}

export function formatActivityTimestamp(
  snapshot: DeploymentActivitySnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.occurredAt);
}

export function formatGradePublicationTimestamp(
  snapshot: DeploymentGradePublicationSnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.publishedAt ?? snapshot.updatedAt);
}

export function formatBrokerVerificationTimestamp(
  verification:
    | {
      checkedAt: string;
    }
    | null
    | undefined,
): string {
  if (verification === null || verification === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(verification.checkedAt);
}

export function formatRuntimeTimestamp(
  snapshot: ControlPlaneRuntimeEvidenceSnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.occurredAt);
}

export function formatOptionalTimestamp(
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(value);
}

export function formatByteSize(byteSize: number | null | undefined): string {
  if (byteSize === null || byteSize === undefined) {
    return "Not recorded yet";
  }

  if (byteSize < 1024) {
    return `${byteSize} bytes`;
  }

  const kibibytes = byteSize / 1024;
  return `${kibibytes.toFixed(kibibytes >= 10 ? 0 : 1)} KiB`;
}

export function describeActivityLtiProfile(
  detail: Record<string, unknown> | null | undefined,
): string | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  return formatResolvedLtiProfile({
    id: readLtiProfileId(detail),
    source: readLtiProfileSource(detail),
  });
}

export function describeBoundaryDenialCategory(
  category: ControlPlaneDiagnosticItem["boundaryDenialCategory"],
): string | null {
  switch (category) {
    case "specInvalid":
      return "Spec-invalid request";
    case "policyDenied":
      return "Policy denial";
    case null:
      return null;
  }
}

export function describeRuntimeRoute(route: string | null): string | null {
  switch (route) {
    case "session":
      return "Route Session bootstrap";
    case "content":
      return "Route Reviewed content";
    case "finalize":
      return "Route Finalize";
    case "local-state.read":
      return "Route Local state read";
    case "local-state.write":
      return "Route Local state write";
    case null:
      return null;
    default:
      return `Route ${route}`;
  }
}

export function describeCompatibilityPathSummary(
  snapshot: DeploymentActivitySnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Lantern has not recorded a governed compatibility path for this setup yet.";
  }

  const scope = readStringDetail(snapshot.detail, "scope");
  const path = readStringDetail(snapshot.detail, "path");

  switch (`${scope}:${path}`) {
    case "login:opaque_login_hint_decode":
      return "Lantern last decoded an opaque login hint on the saved deployment path.";
    case "login:opaque_lti_message_hint_decode":
      return "Lantern last decoded an opaque LTI message hint on the saved deployment path.";
    case "login:platform_default_launch_target":
      return "Lantern last filled the default launch target on the saved deployment path.";
    case "launch:jwks_refetch":
      return "Lantern last retried launch JWKS lookup on the saved deployment path.";
    case "launch:target_link_uri_drift":
      return "Lantern last used launch target drift tolerance on the saved deployment path.";
    case "deep_linking:jti_nonce_bridge":
      return "Lantern last bridged the Deep Linking nonce from jti on the saved deployment path.";
    case "deep_linking:jwks_refetch":
      return "Lantern last retried Deep Linking JWKS lookup on the saved deployment path.";
    case "deep_linking:target_link_uri_drift":
      return "Lantern last used Deep Linking target drift tolerance on the saved deployment path.";
    case "service:service_401_retry":
      return "Lantern last retried an LMS service request after a 401 on the saved deployment path.";
    default:
      return snapshot.summary;
  }
}

export function readStringDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const value = detail[key];

  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readBooleanDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const value = detail[key];

  return typeof value === "boolean" ? value : null;
}

function readNumberDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const value = detail[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  if (detail === null || detail === undefined) {
    return [];
  }

  const value = detail[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string =>
    typeof entry === "string" && entry.trim() !== ""
  );
}

export function readNestedStringDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
  nestedKey: string,
): string | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const value = detail[key];

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const nestedValue = (value as Record<string, unknown>)[nestedKey];

  return typeof nestedValue === "string" && nestedValue.trim() !== ""
    ? nestedValue.trim()
    : null;
}

function formatResolvedLtiProfile(input: {
  id: string | null;
  source: string | null;
}): string | null {
  if (
    input.id === null ||
    !isLtiProfileId(input.id) ||
    (input.source !== "lanternDefault" && input.source !== "deploymentOverride")
  ) {
    return null;
  }

  return `Profile ${
    describeResolvedLtiProfile({
      id: input.id,
      source: input.source,
    })
  }`;
}

function readLtiProfileId(detail: Record<string, unknown>): string | null {
  const value = detail["ltiProfileId"];

  return typeof value === "string" ? value : null;
}

function readLtiProfileSource(detail: Record<string, unknown>): string | null {
  const value = detail["ltiProfileSource"];

  return typeof value === "string" ? value : null;
}

function readRuntimeSandboxModel(
  detail: Record<string, unknown> | null | undefined,
): ControlPlaneRuntimeEvidenceSnapshot["sandboxModel"] {
  return readStringDetail(detail, "sandboxModel") ===
      "contained_browser_runtime"
    ? "contained_browser_runtime"
    : null;
}

function readRuntimeBoundary(
  detail: Record<string, unknown> | null | undefined,
): ControlPlaneRuntimeEvidenceSnapshot["boundary"] {
  return readStringDetail(detail, "boundary") === "app_runtime_origin"
    ? "app_runtime_origin"
    : null;
}

function describeDimensionStatus(status: ControlPlaneHealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs follow-up";
    case "failed":
      return "Failed";
    case "unknown":
      return "Unknown";
  }
}

function describeDiagnosticTone(
  item: ControlPlaneDiagnosticItem,
): "healthy" | "attention" | "failed" | "unknown" {
  if (item.retryable) {
    return "attention";
  }

  if (item.status === "failed") {
    return "failed";
  }

  return "unknown";
}

function describeRuntimeFact<T>(
  value: T | null,
  describe: (value: T) => string,
): string | null {
  return value === null ? null : describe(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function describeProblemFactSummary(
  problemCount: number,
  retryableCount: number,
): string {
  if (problemCount === 0) {
    return "No problems are recorded for this LMS setup right now.";
  }

  if (retryableCount === 0) {
    return "Open the details below to review the latest failures and warnings.";
  }

  return `${retryableCount} retry action${
    retryableCount === 1 ? "" : "s"
  } still need operator follow-up.`;
}
