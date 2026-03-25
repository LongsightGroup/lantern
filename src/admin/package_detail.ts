import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
  summarizeCapabilities,
  summarizeFlaggedCapabilities,
  summarizeGrading,
  summarizeRoles,
  summarizeValidation,
} from '../package_review/summary.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { type AdminNotice, escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';

export function renderPackageDetailPage(input: {
  packageVersion: PackageVersionRecord;
  history: PackageVersionRecord[];
  notice?: AdminNotice | null;
}): string {
  const packageVersion = input.packageVersion;
  const flaggedCapabilities = summarizeFlaggedCapabilities(packageVersion.capabilities);
  const capabilitySummary = summarizeCapabilities(packageVersion.capabilities);
  const grading = summarizeGrading(packageVersion.grading);
  const validation = summarizeValidation(packageVersion);

  return renderAdminLayout({
    title: `${packageVersion.title} ${packageVersion.version}`,
    eyebrow: 'Package Dossier',
    heading: packageVersion.title,
    intro:
      'Review the exact package version, the permissions it asks for, and the evidence Lantern captured before any deployment pin is allowed.',
    breadcrumbs: [
      { label: 'Packages', href: '/admin/packages' },
      { label: packageVersion.title },
      { label: packageVersion.version },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="${approvalStatusClass(packageVersion.approvalStatus)}">${escapeHtml(
            approvalStatusLabel(packageVersion.approvalStatus),
          )}</p>
          <div class="stack">
            <h2>Version ${escapeHtml(packageVersion.version)}</h2>
            <p>${escapeHtml(
              packageVersion.description ?? 'No package description was provided.',
            )}</p>
            <p class="micro muted">${escapeHtml(
              approvalStatusDetail(packageVersion.approvalStatus),
            )}</p>
          </div>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Owner</span>
              <span class="fact-value">Owner ${escapeHtml(packageVersion.owner.id)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Roles</span>
              <span class="fact-value">${escapeHtml(summarizeRoles(packageVersion.roles))}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Install scope</span>
              <span class="fact-value">${escapeHtml(packageVersion.installScope)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Imported</span>
              <span class="fact-value">${escapeHtml(
                formatDateTime(packageVersion.importedAt),
              )}</span>
            </div>
          </div>
          <section class="stack">
            <p class="section-label">Requested capabilities</p>
            <div class="chip-row">
              ${capabilitySummary
                .map(
                  (capability) =>
                    `<span class="chip ${capability.flagged ? 'chip-flagged' : ''}">${escapeHtml(
                      capability.label,
                    )}</span>`,
                )
                .join('')}
            </div>
            ${
              flaggedCapabilities.length > 0
                ? `<div class="callout">
              <h3>Risk callouts</h3>
              <ul>
                ${flaggedCapabilities
                  .map(
                    (capability) =>
                      `<li><strong>${escapeHtml(capability.label)}</strong>: ${escapeHtml(
                        capability.detail,
                      )}${
                        capability.flagLabel ? ` (${escapeHtml(capability.flagLabel)})` : ''
                      }</li>`,
                  )
                  .join('')}
              </ul>
            </div>`
                : ''
            }
          </section>
        </div>
        <aside class="stack">
          <section class="fact">
            <span class="fact-label">Grading</span>
            <strong class="fact-value">${escapeHtml(grading.label)}</strong>
            <p class="micro muted">${escapeHtml(grading.detail)}</p>
          </section>
          <section class="fact">
            <span class="fact-label">Validation evidence</span>
            <strong class="fact-value">${escapeHtml(validation.label)}</strong>
            <p class="micro muted">${escapeHtml(validation.detail)}</p>
          </section>
          <section class="fact">
            <span class="fact-label">Next operator step</span>
            <a class="button-secondary" href="/admin/packages/${escapeHtml(
              packageVersion.appId,
            )}/deployment">Open exact version picker</a>
          </section>
          <section class="fact">
            <span class="fact-label">Placement audit</span>
            <p class="micro muted">Open a reviewed placement by id.</p>
            <form method="get" action="/admin/placements" class="stack">
              <div class="field">
                <label for="placement-id">Placement id</label>
                <input
                  id="placement-id"
                  name="placementId"
                  type="text"
                  placeholder="placement-123"
                >
              </div>
              <div class="button-row">
                <button type="submit" class="button-secondary">Open placement audit</button>
              </div>
            </form>
          </section>
        </aside>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body grid">
        <div class="stack">
          <p class="section-label">Review evidence</p>
          <div class="line-list">
            ${capabilitySummary
              .map(
                (capability) =>
                  `<article class="line-item">
              <p class="line-title">${escapeHtml(capability.label)}${
                capability.flagLabel
                  ? ` <span class="micro muted">${escapeHtml(capability.flagLabel)}</span>`
                  : ''
              }</p>
              <p class="line-copy">${escapeHtml(capability.detail)}</p>
            </article>`,
              )
              .join('')}
            <article class="line-item">
              <p class="line-title">Grading model</p>
              <p class="line-copy">${escapeHtml(grading.detail)}</p>
            </article>
            <article class="line-item">
              <p class="line-title">Artifact snapshot</p>
              <p class="line-copy">${escapeHtml(
                packageVersion.artifact.snapshotRoot,
              )} · ${escapeHtml(packageVersion.artifact.digest)}</p>
            </article>
          </div>
        </div>
        ${
          validation.issues.length > 0
            ? `<section class="callout">
              <h3>Fix list</h3>
              <ul>
                ${validation.issues
                  .map(
                    (issue) =>
                      `<li><strong>${escapeHtml(issue.field)}</strong>: ${escapeHtml(
                        issue.message,
                      )}</li>`,
                  )
                  .join('')}
              </ul>
            </section>`
            : ''
        }
      </div>
    </section>
    ${renderDecisionSection(packageVersion)}
    <section class="panel">
      <div class="panel-body two-column">
        <section class="stack">
          <p class="section-label">Version history</p>
          <div class="table-list">
            ${input.history.map((version) => renderHistoryRow(packageVersion, version)).join('')}
          </div>
        </section>
        <section class="stack">
          <p class="section-label">Raw manifest drill-down</p>
          <details>
            <summary>Open persisted raw manifest JSON</summary>
            <pre>${escapeHtml(JSON.stringify(packageVersion.manifestJson, null, 2))}</pre>
          </details>
        </section>
      </div>
    </section>`,
  });
}

function renderDecisionSection(packageVersion: PackageVersionRecord): string {
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

function renderHistoryRow(
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
