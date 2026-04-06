import {
  approvalStatusClass,
  approvalStatusLabel,
  summarizeAccessibilityReview,
} from "../package_review/summary.ts";
import type {
  DeploymentRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";

export function renderVersionHistorySection(
  history: PackageVersionRecord[],
  activeDeployment: Pick<DeploymentRecord, "enabledPackageVersionId">,
): string {
  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Versions</p>
        <details>
          <summary>Past versions and review notes</summary>
          <div class="detail-stack">
            <div class="table-list">
              ${
    history.map((version) => renderHistoryRow(activeDeployment, version)).join(
      "",
    )
  }
            </div>
          </div>
        </details>
      </div>
    </section>`;
}

function renderHistoryRow(
  deployment: Pick<DeploymentRecord, "enabledPackageVersionId">,
  version: PackageVersionRecord,
): string {
  const isPinned = deployment.enabledPackageVersionId === version.id;
  const accessibility = summarizeAccessibilityReview(version);

  return `<article class="table-row">
    <div class="table-row-top">
      <p class="line-title">
        <span>Version ${escapeHtml(version.version)}</span>
        <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(
      approvalStatusLabel(version.approvalStatus),
    )
  }</span>
        ${isPinned ? `<span class="chip">Live now</span>` : ""}
      </p>
      <p class="micro muted">${
    escapeHtml(formatDateTime(version.importedAt))
  }</p>
    </div>
    <p class="line-copy">${
    escapeHtml(version.reviewNotes ?? "No review notes recorded.")
  }</p>
    <p class="micro muted">Accessibility: ${escapeHtml(accessibility.label)}. ${
    escapeHtml(accessibility.detail)
  }</p>
    ${
    accessibility.exceptionNote === null
      ? ""
      : `<p class="micro muted">${escapeHtml(accessibility.exceptionNote)}</p>`
  }
  </article>`;
}
