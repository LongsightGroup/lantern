import type {
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  ControlPlaneHealthStatus,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
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
  const status = dimension === null ? 'Unknown' : describeDimensionStatus(dimension.status);
  const summary =
    dimension?.summary ?? 'No control-plane evidence has been recorded for this dimension yet.';
  const checkedAt =
    dimension?.checkedAt === null || dimension?.checkedAt === undefined
      ? 'Not recorded yet'
      : formatDateTime(dimension.checkedAt);

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(label)}</span>
          <span class="chip">${escapeHtml(status)}</span>
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

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(describeDiagnosticKind(item.kind))}</span>
          <span class="chip">${escapeHtml(describeDiagnosticStatus(item))}</span>
        </p>
        <p class="micro muted">${escapeHtml(formatDateTime(item.occurredAt))}</p>
      </div>
      <p class="line-copy">${escapeHtml(item.operatorSummary)}</p>
      ${details.length === 0 ? '' : `<p class="micro muted">${escapeHtml(details.join(' · '))}</p>`}
      ${retryAction}
    </article>`;
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
