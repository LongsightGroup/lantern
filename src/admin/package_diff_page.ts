import type { PackageFileDiff, PackageVersionDiff } from '../package_review/package_diff.ts';
import { approvalStatusClass, approvalStatusLabel } from '../package_review/summary.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';
import { renderPackagePageNav } from './package_navigation.ts';

export function renderPackageDiffPage(input: {
  diff: PackageVersionDiff;
  history: PackageVersionRecord[];
}): string {
  const targetVersion = input.diff.targetVersion;
  const baseVersion = input.diff.baseVersion;
  const changedFiles = input.diff.files.filter((file) => file.kind !== 'unchanged');
  const changedManifestFields = input.diff.manifest.filter((field) => field.changed);

  return renderAdminLayout({
    title: `${targetVersion.title} ${targetVersion.version} changes`,
    eyebrow: 'Version changes',
    heading: targetVersion.title,
    intro: `Compare version ${targetVersion.version} against ${baseVersion.version}.`,
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: targetVersion.title,
        href: `/admin/packages/${targetVersion.appId}`,
      },
      {
        label: targetVersion.version,
        href: `/admin/packages/${targetVersion.appId}/versions/${targetVersion.version}`,
      },
      { label: 'Changes' },
    ],
    pageNav: renderPackagePageNav({
      appId: targetVersion.appId,
      history: input.history,
      currentSection: 'diff',
      currentVersion: targetVersion,
    }),
    body: `<section class="panel">
      <div class="panel-body stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Snapshot comparison</p>
            <h2>Version ${escapeHtml(targetVersion.version)} from ${
      escapeHtml(
        baseVersion.version,
      )
    }</h2>
            <p class="line-copy">
              Lantern compares the immutable reviewed package snapshots saved for each version.
            </p>
          </div>
          <div class="button-row">
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        targetVersion.appId,
      )
    }/versions/${escapeHtml(targetVersion.version)}">Back to version</a>
          </div>
        </div>
        <div class="facts">
          ${renderVersionFact('Base', baseVersion)}
          ${renderVersionFact('Target', targetVersion)}
          <div class="fact">
            <span class="fact-label">Changed files</span>
            <span class="fact-value">${escapeHtml(String(changedFiles.length))}</span>
            <p class="micro muted">
              ${escapeHtml(formatFileSummary(input.diff.summary))}
            </p>
          </div>
          <div class="fact">
            <span class="fact-label">Manifest changes</span>
            <span class="fact-value">${escapeHtml(String(changedManifestFields.length))}</span>
            <p class="micro muted">Core manifest and capability fields that changed.</p>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Contract changes</p>
        ${
      changedManifestFields.length === 0
        ? '<p class="line-copy">No core manifest, capability, or grading fields changed.</p>'
        : `<div class="line-list">
              ${changedManifestFields.map(renderManifestFieldDiff).join('')}
            </div>`
    }
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">File changes</p>
        ${
      changedFiles.length === 0
        ? '<p class="line-copy">No package files changed between these snapshots.</p>'
        : `<div class="table-list">
              ${changedFiles.map(renderFileDiff).join('')}
            </div>`
    }
      </div>
    </section>`,
  });
}

function renderVersionFact(label: string, packageVersion: PackageVersionRecord): string {
  return `<div class="fact">
    <span class="fact-label">${escapeHtml(label)}</span>
    <span class="fact-value">Version ${escapeHtml(packageVersion.version)}</span>
    <p class="micro muted">
      <span class="${approvalStatusClass(packageVersion.approvalStatus)}">${
    escapeHtml(
      approvalStatusLabel(packageVersion.approvalStatus),
    )
  }</span>
      ${escapeHtml(formatDateTime(packageVersion.importedAt))}
    </p>
  </div>`;
}

function renderManifestFieldDiff(field: PackageVersionDiff['manifest'][number]): string {
  return `<article class="line-item">
    <p class="line-title">${escapeHtml(field.label)}</p>
    <p class="line-copy"><strong>Before:</strong> ${escapeHtml(field.before)}</p>
    <p class="line-copy"><strong>After:</strong> ${escapeHtml(field.after)}</p>
  </article>`;
}

function renderFileDiff(file: PackageFileDiff): string {
  return `<article class="table-row">
    <div class="table-row-top">
      <p class="line-title">
        <span class="inline-code">${escapeHtml(file.path)}</span>
        <span class="chip">${escapeHtml(formatFileDiffKind(file.kind))}</span>
      </p>
      <p class="micro muted">${escapeHtml(formatByteDelta(file.byteDelta))}</p>
    </div>
    <p class="line-copy">${escapeHtml(formatFileSizeChange(file))}</p>
    ${renderFileSnippet(file)}
  </article>`;
}

function renderFileSnippet(file: PackageFileDiff): string {
  if (!file.text) {
    return '<p class="micro muted">Binary or non-UTF-8 file. Text diff omitted.</p>';
  }

  if (file.snippet.length === 0) {
    return '';
  }

  return `<pre>${escapeHtml(file.snippet.join('\n'))}</pre>`;
}

function formatFileDiffKind(kind: PackageFileDiff['kind']): string {
  switch (kind) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'modified':
      return 'Modified';
    case 'unchanged':
      return 'Unchanged';
  }
}

function formatFileSummary(summary: PackageVersionDiff['summary']): string {
  return `${summary.added} added, ${summary.modified} modified, ${summary.removed} removed, ${summary.unchanged} unchanged.`;
}

function formatFileSizeChange(file: PackageFileDiff): string {
  return `${formatBytes(file.baseByteLength)} to ${formatBytes(file.targetByteLength)}`;
}

function formatByteDelta(delta: number): string {
  if (delta === 0) {
    return 'No size change';
  }

  return `${delta > 0 ? '+' : ''}${formatBytes(delta)}`;
}

function formatBytes(bytes: number): string {
  const absoluteBytes = Math.abs(bytes);

  if (absoluteBytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}
