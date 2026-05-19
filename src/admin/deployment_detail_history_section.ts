import {
  approvalStatusClass,
  approvalStatusLabel,
  summarizeAccessibilityReview,
} from '../package_review/summary.ts';
import type { DeploymentRecord, PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml, formatDateTime } from './layout.ts';

export function renderVersionHistorySection(
  history: PackageVersionRecord[],
  activeDeployment: Pick<DeploymentRecord, 'enabledPackageVersionId'>,
): string {
  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Versions</p>
        <h2>Past versions and review notes</h2>
        <div class="table-scroll">
          <table class="detail-table version-history-table">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Status</th>
                <th scope="col">For learners</th>
                <th scope="col">Imported</th>
                <th scope="col">Accessibility</th>
                <th scope="col">Review notes</th>
              </tr>
            </thead>
            <tbody>
              ${history.map((version) => renderHistoryRow(activeDeployment, version)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function renderHistoryRow(
  deployment: Pick<DeploymentRecord, 'enabledPackageVersionId'>,
  version: PackageVersionRecord,
): string {
  const isPinned = deployment.enabledPackageVersionId === version.id;
  const accessibility = summarizeAccessibilityReview(version);

  return `<tr>
    <td>
      <div class="detail-table-primary">
        <strong>Version ${escapeHtml(version.version)}</strong>
      </div>
    </td>
    <td>
      <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(
      approvalStatusLabel(version.approvalStatus),
    )
  }</span>
    </td>
    <td>${
    isPinned ? '<span class="chip chip-status chip-status-healthy">Live now</span>' : 'Past version'
  }</td>
    <td>${escapeHtml(formatDateTime(version.importedAt))}</td>
    <td>
      <div class="detail-table-stack">
        <span>${escapeHtml(accessibility.label)}</span>
        <span class="micro muted">${escapeHtml(accessibility.detail)}</span>
        ${
    accessibility.exceptionNote === null
      ? ''
      : `<span class="micro muted">${escapeHtml(accessibility.exceptionNote)}</span>`
  }
      </div>
    </td>
    <td>
      <div class="detail-table-notes">${
    escapeHtml(
      version.reviewNotes ?? 'No review notes recorded.',
    )
  }</div>
    </td>
  </tr>`;
}
