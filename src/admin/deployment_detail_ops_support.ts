import type {
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  ControlPlaneHealthStatus,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  DeploymentRecentLaunch,
} from '../ops/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';
import {
  describeDiagnosticKind,
  describeDiagnosticStatus,
} from './deployment_detail_ops_labels.ts';

export function renderActivityFact(label: string, value: string, summary: string): string {
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
  const tone = dimension?.status ?? 'unknown';
  const status = dimension === null ? 'Unknown' : describeDimensionStatus(dimension.status);
  const summary =
    dimension?.summary ?? 'No control-plane evidence has been recorded for this dimension yet.';
  const checkedAt =
    dimension?.checkedAt === null || dimension?.checkedAt === undefined
      ? 'Not recorded yet'
      : formatDateTime(dimension.checkedAt);

  return `<article class="table-row table-row-status table-row-status-${escapeHtml(tone)}">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(label)}</span>
          <span class="chip chip-status chip-status-${escapeHtml(tone)}">${escapeHtml(
            status,
          )}</span>
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
  const details = [
    item.code === null ? null : `Code ${item.code}`,
    item.attemptId === null ? null : `Attempt ${item.attemptId}`,
  ].filter((value): value is string => value !== null);
  const retryAction =
    item.retryable && retryAttemptId !== null
      ? `<form method="post" action="/admin/packages/${escapeHtml(
          appId,
        )}/deployment/retry-grade-publish" class="stack">
            <input type="hidden" name="attemptId" value="${escapeHtml(retryAttemptId)}" />
            <div class="button-row">
              <button type="submit" class="button-secondary">Retry grade publish</button>
            </div>
          </form>`
      : '';

  return `<article class="table-row table-row-status table-row-status-${escapeHtml(tone)}">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(describeDiagnosticKind(item.kind))}</span>
          <span class="chip chip-status chip-status-${escapeHtml(tone)}">${escapeHtml(
            describeDiagnosticStatus(item),
          )}</span>
        </p>
        <p class="micro muted">${escapeHtml(formatDateTime(item.occurredAt))}</p>
      </div>
      <p class="line-copy">${escapeHtml(item.operatorSummary)}</p>
      ${details.length === 0 ? '' : `<p class="micro muted">${escapeHtml(details.join(' · '))}</p>`}
      ${retryAction}
    </article>`;
}

export function renderRecentLaunchRow(item: DeploymentRecentLaunch): string {
  const identity = resolveLaunchIdentity(item);
  const launchContext = [
    item.contextId === null ? null : `Course or site ${item.contextId}`,
    item.resourceLinkId === null ? null : `Placement ${item.resourceLinkId}`,
  ].filter((value): value is string => value !== null);
  const launchDetails = [
    identity.secondary,
    item.attemptId === null ? null : `Attempt ${item.attemptId}`,
  ].filter((value): value is string => value !== null);
  const title = identity.primary === null ? 'Recent launch' : `Opened by ${identity.primary}`;
  const summary = launchContext.length === 0 ? item.summary : launchContext.join(' · ');

  return `<article class="table-row table-row-status table-row-status-healthy">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(title)}</span>
          <span class="chip chip-status chip-status-healthy">Opened</span>
        </p>
        <p class="micro muted">${escapeHtml(formatDateTime(item.occurredAt))}</p>
      </div>
      <p class="line-copy">${escapeHtml(summary)}</p>
      ${
        launchDetails.length === 0
          ? ''
          : `<p class="micro muted">${escapeHtml(launchDetails.join(' · '))}</p>`
      }
    </article>`;
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

function normalizeOpaqueSubject(value: string): string {
  try {
    const url = new URL(value);
    const pathSegments = url.pathname.split('/').filter((segment) => segment.length > 0);
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
    return 'Not recorded yet';
  }

  return formatDateTime(snapshot.occurredAt);
}

export function formatGradePublicationTimestamp(
  snapshot: DeploymentGradePublicationSnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return 'Not recorded yet';
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
    return 'Not recorded yet';
  }

  return formatDateTime(verification.checkedAt);
}

export function readStringDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const value = detail[key];

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function readBooleanDetail(
  detail: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const value = detail[key];

  return typeof value === 'boolean' ? value : null;
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

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const nestedValue = (value as Record<string, unknown>)[nestedKey];

  return typeof nestedValue === 'string' && nestedValue.trim() !== '' ? nestedValue.trim() : null;
}

function describeDimensionStatus(status: ControlPlaneHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'attention':
      return 'Needs follow-up';
    case 'failed':
      return 'Failed';
    case 'unknown':
      return 'Unknown';
  }
}

function describeDiagnosticTone(
  item: ControlPlaneDiagnosticItem,
): 'healthy' | 'attention' | 'failed' | 'unknown' {
  if (item.retryable) {
    return 'attention';
  }

  if (item.status === 'failed') {
    return 'failed';
  }

  return 'unknown';
}

export function describeProblemFactSummary(problemCount: number, retryableCount: number): string {
  if (problemCount === 0) {
    return 'No problems are recorded for this LMS setup right now.';
  }

  if (retryableCount === 0) {
    return 'Open the details below to review the latest failures and warnings.';
  }

  return `${retryableCount} retry action${
    retryableCount === 1 ? '' : 's'
  } still need operator follow-up.`;
}
