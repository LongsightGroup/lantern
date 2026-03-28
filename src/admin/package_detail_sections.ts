import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
} from '../package_review/summary.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';

export function renderDecisionSection(packageVersion: PackageVersionRecord): string {
  if (packageVersion.approvalStatus === 'pending') {
    return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Decision</p>
        <h2>Approve or reject this exact version once.</h2>
        <p>
          The decision freezes the review state for this version. If the package needs more work, import a new version instead of editing this one in place.
        </p>
        <form method="post" class="stack">
          <div class="field">
            <label for="review-notes">Review notes (optional)</label>
            <textarea id="review-notes" name="reviewNotes" placeholder="Record what made this version ready, or why it stays blocked."></textarea>
          </div>
          <div class="button-row">
            <button type="submit" class="button-primary" formaction="/admin/packages/${escapeHtml(
              String(packageVersion.id),
            )}/approve">Approve version</button>
            <button type="submit" class="button-danger" formaction="/admin/packages/${escapeHtml(
              String(packageVersion.id),
            )}/reject">Reject version</button>
          </div>
        </form>
      </div>
    </section>`;
  }

  return `<section class="panel">
    <div class="panel-body stack">
      <p class="section-label">Decision record</p>
      <h2>${escapeHtml(approvalStatusLabel(packageVersion.approvalStatus))}</h2>
      <p>${escapeHtml(approvalStatusDetail(packageVersion.approvalStatus))}</p>
      ${
        packageVersion.approvalStatus === 'approved'
          ? `<div class="button-row">
            <a class="button-primary" href="/admin/packages/${escapeHtml(
              packageVersion.appId,
            )}/versions/${escapeHtml(
              packageVersion.version,
            )}/preview">Open governed preview launch</a>
          </div>`
          : ''
      }
      <div class="facts">
        <div class="fact">
          <span class="fact-label">Reviewed at</span>
          <span class="fact-value">${escapeHtml(formatDateTime(packageVersion.reviewedAt))}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Notes</span>
          <span class="fact-value">${escapeHtml(
            packageVersion.reviewNotes ?? 'No review notes recorded.',
          )}</span>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderHistoryRow(
  currentVersion: PackageVersionRecord,
  version: PackageVersionRecord,
): string {
  const isCurrent = currentVersion.version === version.version;

  return `<article class="table-row">
    <div class="table-row-top">
      <p class="line-title">
        <a href="/admin/packages/${escapeHtml(version.appId)}/versions/${escapeHtml(
          version.version,
        )}">Version ${escapeHtml(version.version)}</a>
        <span class="${approvalStatusClass(version.approvalStatus)}">${escapeHtml(
          approvalStatusLabel(version.approvalStatus),
        )}</span>
        ${isCurrent ? `<span class="chip">Open dossier</span>` : ''}
      </p>
      <p class="micro muted">${escapeHtml(formatDateTime(version.importedAt))}</p>
    </div>
    <p class="line-copy">${escapeHtml(
      version.reviewNotes ?? approvalStatusDetail(version.approvalStatus),
    )}</p>
  </article>`;
}
