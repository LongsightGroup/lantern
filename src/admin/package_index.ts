import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
} from "../package_review/summary.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";
import {
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from "./layout.ts";

export function renderPackageIndexPage(input: {
  versions: PackageVersionRecord[];
  notice?: AdminNotice | null;
}): string {
  const packageCount =
    new Set(input.versions.map((version) => version.appId)).size;
  const approvedCount =
    input.versions.filter((version) => version.approvalStatus === "approved")
      .length;

  const body = input.versions.length === 0
    ? renderEmptyState()
    : renderInventoryState(input.versions, packageCount, approvedCount);

  return renderAdminLayout({
    title: "Lantern Admin Packages",
    eyebrow: "Package Intake",
    heading: "Bring one reviewed package into view before you wire an LMS.",
    intro:
      "Start with the demo app, then move through the same review surface institutions will use for every governed deployment.",
    notice: input.notice ?? null,
    body,
  });
}

function renderEmptyState(): string {
  return `<section class="panel">
    <div class="panel-body empty-state">
      <p class="section-label">Guided first step</p>
      <h2>Import the demo learning game and open its review dossier.</h2>
      <p>
        Lantern starts with one known-good package so administrators can see the full review, approval,
        and deployment flow before any custom LMS wiring begins.
      </p>
      <div class="facts">
        <div class="fact">
          <span class="fact-label">Demo app</span>
          <span class="fact-value">Chapter 4 Asteroids</span>
        </div>
        <div class="fact">
          <span class="fact-label">What arrives</span>
          <span class="fact-value">Manifest, files, and review metadata</span>
        </div>
        <div class="fact">
          <span class="fact-label">Why first</span>
          <span class="fact-value">Lets the institution see the whole operator path in one session</span>
        </div>
      </div>
      <form method="post" action="/admin/packages/import-demo" class="button-row">
        <button type="submit" class="button-primary">Start with the demo app</button>
        <span class="micro muted">The import snapshots the reviewed bytes into Lantern-managed storage.</span>
      </form>
      <section class="callout">
        <h3>What the operator sees next</h3>
        <ul>
          <li>Status, version, owner, and requested capabilities at the top of the dossier</li>
          <li>Plain-language validation evidence instead of schema jargon</li>
          <li>An exact-version deployment picker instead of a floating latest release</li>
        </ul>
      </section>
    </div>
  </section>`;
}

function renderInventoryState(
  versions: PackageVersionRecord[],
  packageCount: number,
  approvedCount: number,
): string {
  return `<section class="panel">
    <div class="panel-body stack">
      <div class="facts">
        <div class="fact">
          <span class="fact-label">Imported packages</span>
          <span class="fact-value">${escapeHtml(String(packageCount))}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Reviewed versions</span>
          <span class="fact-value">${escapeHtml(String(versions.length))}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Approved now</span>
          <span class="fact-value">${escapeHtml(String(approvedCount))}</span>
        </div>
      </div>
      <div class="button-row">
        <form method="post" action="/admin/packages/import-demo">
          <button type="submit" class="button-secondary">Re-run the demo import</button>
        </form>
        <span class="micro muted">Exact versions stay immutable. Re-importing the same version will fail clearly.</span>
      </div>
      <div class="table-list">
        ${versions.map(renderInventoryRow).join("")}
      </div>
    </div>
  </section>`;
}

function renderInventoryRow(version: PackageVersionRecord): string {
  return `<article class="table-row">
    <div class="table-row-top">
      <div class="stack">
        <p class="line-title">
          <span>${escapeHtml(version.title)}</span>
          <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(approvalStatusLabel(version.approvalStatus))
  }</span>
        </p>
        <p class="line-copy">${
    escapeHtml(approvalStatusDetail(version.approvalStatus))
  }</p>
      </div>
      <div class="button-row">
        <a class="button-ghost" href="/admin/packages/${
    escapeHtml(version.appId)
  }/versions/${escapeHtml(version.version)}">Open dossier</a>
        <a class="button-secondary" href="/admin/packages/${
    escapeHtml(version.appId)
  }/deployment">Version picker</a>
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Version</strong> ${escapeHtml(version.version)}</span>
      <span><strong>Owner</strong> ${escapeHtml(version.owner.id)}</span>
      <span><strong>App ID</strong> ${escapeHtml(version.appId)}</span>
      <span><strong>Imported</strong> ${
    escapeHtml(formatDateTime(version.importedAt))
  }</span>
    </div>
  </article>`;
}
