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

interface PackageLibraryEntry {
  appId: string;
  title: string;
  description: string | null;
  ownerId: string;
  latestVersion: string;
  latestApprovalStatus: PackageVersionRecord["approvalStatus"];
  latestImportedAt: string;
  versionCount: number;
  approvedVersionCount: number;
}

export function renderPackageIndexPage(input: {
  versions: PackageVersionRecord[];
  notice?: AdminNotice | null;
}): string {
  const body = input.versions.length === 0
    ? renderEmptyState()
    : renderPackageLibrary(input.versions);

  return renderAdminLayout({
    title: "Lantern Admin Packages",
    eyebrow: "Package Home",
    heading: "Open a package and continue from its dossier.",
    intro:
      "Use this page to find a package, review its exact version, and hand off deployment or verification work to the dedicated admin pages.",
    activePath: "/admin/packages",
    notice: input.notice ?? null,
    body,
  });
}

function renderEmptyState(): string {
  return `<section class="panel">
    <div class="panel-body two-column">
      <div class="stack">
        <p class="section-label">Guided first step</p>
        <h2>Import the demo app.</h2>
        <p>
          Start with one known-good package so the review, approval, preview, and deployment flow is visible end to end.
        </p>
        <p class="micro muted">
          Deployments, verification, and placement audits stay in their own admin pages once the package is in view.
        </p>
      </div>
      <div class="stack">
        <section class="fact">
          <span class="fact-label">Demo package</span>
          <strong class="fact-value">Chapter 4 Asteroids</strong>
          <p class="micro muted">Playable arcade demo with review metadata and governed preview fixtures.</p>
        </section>
        <form method="post" action="/admin/packages/import-demo" class="button-row">
          <button type="submit" class="button-primary">Start with the demo app</button>
        </form>
        <p class="micro muted">Lantern snapshots the reviewed bytes into Lantern-managed storage.</p>
      </div>
    </div>
  </section>`;
}

function renderPackageLibrary(
  versions: PackageVersionRecord[],
): string {
  const entries = buildPackageLibraryEntries(versions);

  return `<section class="panel">
    <div class="panel-body two-column">
      <div class="stack">
        <p class="section-label">Package library</p>
        <h2>Pick one package to review or deploy.</h2>
        <p>
          Open the latest dossier for a package, then move into deployment, preview, or review from that single source of truth.
        </p>
      </div>
      <div class="stack">
        <form method="post" action="/admin/packages/import-demo">
          <button type="submit" class="button-secondary">Open the demo dossier</button>
        </form>
        <p class="micro muted">
          If the demo already exists, Lantern reopens the exact dossier instead of importing it again.
        </p>
      </div>
    </div>
  </section>
  <section class="panel">
    <div class="panel-body stack">
      <div class="table-list">
        ${entries.map(renderPackageEntry).join("")}
      </div>
    </div>
  </section>`;
}

function buildPackageLibraryEntries(
  versions: PackageVersionRecord[],
): PackageLibraryEntry[] {
  const entries = new Map<string, PackageLibraryEntry>();

  for (const version of versions) {
    const existing = entries.get(version.appId);

    if (!existing) {
      entries.set(version.appId, {
        appId: version.appId,
        title: version.title,
        description: version.description,
        ownerId: version.owner.id,
        latestVersion: version.version,
        latestApprovalStatus: version.approvalStatus,
        latestImportedAt: version.importedAt,
        versionCount: 1,
        approvedVersionCount: version.approvalStatus === "approved" ? 1 : 0,
      });
      continue;
    }

    existing.versionCount += 1;
    if (version.approvalStatus === "approved") {
      existing.approvedVersionCount += 1;
    }
  }

  return [...entries.values()];
}

function renderPackageEntry(entry: PackageLibraryEntry): string {
  return `<article class="table-row">
    <div class="table-row-top">
      <div class="stack">
        <p class="line-title">
          <span>${escapeHtml(entry.title)}</span>
          <span class="${approvalStatusClass(entry.latestApprovalStatus)}">${
    escapeHtml(
      approvalStatusLabel(entry.latestApprovalStatus),
    )
  }</span>
        </p>
        <p class="line-copy">${
    escapeHtml(
      entry.description ?? approvalStatusDetail(entry.latestApprovalStatus),
    )
  }</p>
      </div>
      <div class="button-row">
        <a class="button-ghost" href="/admin/packages/${
    escapeHtml(entry.appId)
  }/versions/${
    escapeHtml(
      entry.latestVersion,
    )
  }">Open latest dossier</a>
        <a class="button-secondary" href="/admin/packages/${
    escapeHtml(
      entry.appId,
    )
  }/deployment">Open deployments</a>
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Latest version</strong> ${
    escapeHtml(entry.latestVersion)
  }</span>
      <span><strong>Versions</strong> ${
    escapeHtml(String(entry.versionCount))
  }</span>
      <span><strong>Approved</strong> ${
    escapeHtml(String(entry.approvedVersionCount))
  }</span>
      <span><strong>Owner</strong> ${escapeHtml(entry.ownerId)}</span>
      <span><strong>App ID</strong> ${escapeHtml(entry.appId)}</span>
      <span><strong>Imported</strong> ${
    escapeHtml(formatDateTime(entry.latestImportedAt))
  }</span>
    </div>
  </article>`;
}
