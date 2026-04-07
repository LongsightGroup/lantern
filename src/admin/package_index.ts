import { listReferencePackageIds } from "../package_review/intake.ts";
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
    title: "Lantern Admin Apps",
    eyebrow: "Apps",
    heading: "Open an app.",
    intro:
      "From there you can review a version, change app settings, or run a test launch.",
    activePath: "/admin/packages",
    notice: input.notice ?? null,
    body,
  });
}

function renderEmptyState(): string {
  return `<section class="panel">
    <div class="panel-body two-column">
      <div class="stack">
        <p class="section-label">Get started</p>
        <h2>Import a reference app.</h2>
        <p>
          Lantern ships two reference apps so you can try review, test launch, and LMS setup from start to finish.
        </p>
      </div>
      <div class="stack">
        ${renderReferencePackageActions("button-primary")}
      </div>
    </div>
  </section>`;
}

function renderPackageLibrary(versions: PackageVersionRecord[]): string {
  const entries = buildPackageLibraryEntries(versions);

  return `<section class="panel">
    <div class="panel-body two-column">
      <div class="stack">
        <p class="section-label">Apps</p>
        <h2>Choose an app.</h2>
        <p>
          Open a version to review it, or open app settings to connect it to an LMS.
        </p>
      </div>
      <div class="stack">
        ${renderReferencePackageActions("button-secondary")}
        <p class="micro muted">
          If a reference app is already here, Lantern opens that same version instead of importing it again.
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
    escapeHtml(
      entry.appId,
    )
  }/versions/${escapeHtml(entry.latestVersion)}">Open version details</a>
        <a class="button-secondary" href="/admin/packages/${
    escapeHtml(
      entry.appId,
    )
  }/deployment">App settings</a>
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
      <span><strong>Added</strong> ${
    escapeHtml(formatDateTime(entry.latestImportedAt))
  }</span>
    </div>
  </article>`;
}

function renderReferencePackageActions(
  buttonClass: "button-primary" | "button-secondary",
): string {
  return listReferencePackageIds().map((appId) => {
    const title = formatReferencePackageTitle(appId);
    const summary = describeReferencePackage(appId);

    return `<section class="fact">
        <span class="fact-label">Reference app</span>
        <strong class="fact-value">${escapeHtml(title)}</strong>
        <p class="micro muted">${escapeHtml(summary)}</p>
        <form method="post" action="/admin/packages/import-reference" class="button-row">
          <input type="hidden" name="appId" value="${escapeHtml(appId)}" />
          <button type="submit" class="${escapeHtml(buttonClass)}">Open ${
      escapeHtml(title)
    }</button>
        </form>
      </section>`;
  }).join("");
}

function formatReferencePackageTitle(appId: string): string {
  switch (appId) {
    case "chapter-4-asteroids":
      return "Chapter 4 Asteroids";
    case "quick-study":
      return "Quick Study";
    default:
      return appId;
  }
}

function describeReferencePackage(appId: string): string {
  switch (appId) {
    case "chapter-4-asteroids":
      return "Arcade-style vocabulary review with saved launch and review data.";
    case "quick-study":
      return "Flashcard-style study app with a calmer pacing and completion grading.";
    default:
      return "Shipped reference app.";
  }
}
