import { approvalStatusClass, approvalStatusLabel } from '../package_review/summary.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { type AdminNotice, escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';

interface PackageLibraryEntry {
  appId: string;
  title: string;
  description: string | null;
  latestVersion: string;
  latestApprovalStatus: PackageVersionRecord['approvalStatus'];
  latestImportedAt: string;
  versionCount: number;
  approvedVersionCount: number;
}

export function renderPackageIndexPage(input: {
  versions: PackageVersionRecord[];
  notice?: AdminNotice | null;
}): string {
  const body =
    input.versions.length === 0 ? renderEmptyState() : renderPackageLibrary(input.versions);

  return renderAdminLayout({
    title: 'Lantern Admin Apps',
    eyebrow: 'Apps',
    heading: 'Apps',
    intro: 'Open one app, then move into versions, settings, or governed test launch.',
    activePath: '/admin/packages',
    notice: input.notice ?? null,
    body,
  });
}

function renderEmptyState(): string {
  return `<section class="panel">
    <div class="panel-body panel-header">
      <div class="stack">
        <p class="section-label">Inventory</p>
        <h2>No apps yet.</h2>
        <p>
          Import one reviewed package directory when you are ready to add an app to governed inventory. Reference apps stay available as clean samples on their own page.
        </p>
      </div>
      <div class="button-row">
        <a class="button-primary" href="/admin/packages/import">Import package</a>
        <a class="button-secondary" href="/admin/packages/reference">Open reference apps</a>
      </div>
    </div>
  </section>`;
}

function renderPackageLibrary(versions: PackageVersionRecord[]): string {
  const entries = buildPackageLibraryEntries(versions);

  return `<section class="panel">
    <div class="panel-body panel-header">
      <div class="stack">
        <p class="section-label">Inventory</p>
        <h2>${escapeHtml(entries.length === 1 ? '1 app' : `${entries.length} apps`)}</h2>
        <p>Keep the main inventory focused on the reviewed packages you manage. Shipped examples live on their own page.</p>
      </div>
      <div class="button-row">
        <a class="button-primary" href="/admin/packages/import">Import package</a>
        <a class="button-secondary" href="/admin/packages/reference">Import reference app</a>
      </div>
    </div>
  </section>
  <section class="panel">
    <div class="panel-body stack">
      <div class="table-list">
        ${entries.map(renderPackageEntry).join('')}
      </div>
    </div>
  </section>`;
}

function buildPackageLibraryEntries(versions: PackageVersionRecord[]): PackageLibraryEntry[] {
  const entries = new Map<string, PackageLibraryEntry>();

  for (const version of versions) {
    const existing = entries.get(version.appId);

    if (!existing) {
      entries.set(version.appId, {
        appId: version.appId,
        title: version.title,
        description: version.description,
        latestVersion: version.version,
        latestApprovalStatus: version.approvalStatus,
        latestImportedAt: version.importedAt,
        versionCount: 1,
        approvedVersionCount: version.approvalStatus === 'approved' ? 1 : 0,
      });
      continue;
    }

    existing.versionCount += 1;
    if (version.approvalStatus === 'approved') {
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
          <span class="${approvalStatusClass(entry.latestApprovalStatus)}">${escapeHtml(
            approvalStatusLabel(entry.latestApprovalStatus),
          )}</span>
        </p>
        <p class="line-copy">${escapeHtml(
          entry.description ?? 'No app description was provided.',
        )}</p>
      </div>
      <div class="button-row">
        <a class="button-primary" href="/admin/packages/${escapeHtml(entry.appId)}">Open app</a>
        <a class="button-ghost" href="/admin/packages/${escapeHtml(
          entry.appId,
        )}/deployment">App settings</a>
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Latest version</strong> ${escapeHtml(entry.latestVersion)}</span>
      <span><strong>Versions</strong> ${escapeHtml(String(entry.versionCount))}</span>
      <span><strong>Approved</strong> ${escapeHtml(String(entry.approvedVersionCount))}</span>
      <span><strong>Added</strong> ${escapeHtml(formatDateTime(entry.latestImportedAt))}</span>
    </div>
  </article>`;
}
