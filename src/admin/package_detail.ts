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
import { renderDecisionSection, renderHistoryRow } from './package_detail_sections.ts';

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
    activePath: '/admin/packages',
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
            )}/deployment">Open deployments</a>
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
