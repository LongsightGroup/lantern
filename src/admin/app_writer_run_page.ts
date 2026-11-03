import type { AppGenerationRunRecord, AppGenerationWorkspaceRecord } from '../app_writer/types.ts';
import type {
  AuditEventRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from '../package_review/types.ts';
import {
  type AdminIdentity,
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from './layout.ts';
import {
  formatSelectedContext,
  formatStatus,
  isActiveGenerationStatus,
} from './app_writer_run_view_model.ts';
import {
  renderActivity,
  renderFindings,
  renderGeneratedFilesSummary,
  renderGeneratedPackageRuntimeLog,
  renderGenerationPlan,
  renderGenerationProgress,
  renderGenerationRefreshScript,
  renderLiveProgress,
  renderModelRequestMetadata,
  renderPreviewSummary,
} from './app_writer_run_sections.ts';

export function renderAppGenerationRunPage(input: {
  identity: AdminIdentity;
  run: AppGenerationRunRecord;
  workspace?: AppGenerationWorkspaceRecord | null;
  packageVersion?: PackageVersionRecord | null;
  latestPreviewSession?: PreviewSessionRecord | null;
  previewEvidence?: PreviewEvidenceRecord[];
  activityEvents?: AuditEventRecord[];
  notice?: AdminNotice | null;
}): string {
  const run = input.run;
  const workspace = input.workspace ?? null;
  const packageVersion = input.packageVersion ?? null;
  const latestPreviewSession = input.latestPreviewSession ?? null;
  const previewEvidence = input.previewEvidence ?? [];
  const refreshWhileRunning = isActiveGenerationStatus(run.status);

  return renderAdminLayout({
    identity: input.identity,
    title: `Generation ${run.generationId}`,
    eyebrow: 'App writer run',
    heading: run.generatedAppId ?? run.requestedAppId ?? 'Generated app',
    intro: `Status: ${formatStatus(run.status)}.`,
    activePath: '/admin/app-writer',
    breadcrumbs: [
      { label: 'App writer', href: '/admin/app-writer' },
      {
        label: run.generationId,
      },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Request</p>
          <h2>${escapeHtml(formatStatus(run.status))}</h2>
          ${renderGenerationProgress(run.status)}
          ${renderLiveProgress({ run, workspace })}
          ${
            refreshWhileRunning
              ? `<p class="line-copy">Lantern is still working. This page refreshes while generation runs, and the run URL can be reopened later.</p>
                <div class="button-row">
                  <a class="button-secondary" href="/admin/app-writer/runs/${escapeHtml(
                    run.generationId,
                  )}">Refresh status</a>
                </div>`
              : ''
          }
          <p>${escapeHtml(run.promptText)}</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Starter</span>
              <span class="fact-value">${escapeHtml(run.selectedStarterId ?? 'Not selected')}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Repairs</span>
              <span class="fact-value">${escapeHtml(String(run.repairAttemptCount))}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Created</span>
              <span class="fact-value">${escapeHtml(formatDateTime(run.createdAt))}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Updated</span>
              <span class="fact-value">${escapeHtml(formatDateTime(run.updatedAt))}</span>
            </div>
          </div>
        </div>
        <aside class="stack">
          <section class="fact">
            <span class="fact-label">Package version</span>
            ${
              packageVersion === null
                ? `<strong class="fact-value">Not saved</strong>`
                : `<a class="button-secondary" href="/admin/packages/${escapeHtml(
                    packageVersion.appId,
                  )}/versions/${escapeHtml(packageVersion.version)}">${escapeHtml(
                    packageVersion.approvalStatus === 'approved'
                      ? 'Open approved version'
                      : 'Open pending version',
                  )}</a>`
            }
          </section>
          <section class="fact">
            <span class="fact-label">Preview action</span>
            ${
              packageVersion === null
                ? '<strong class="fact-value">Not available</strong><p class="micro muted">Lantern saves previewable packages only after validation and preview checks pass.</p>'
                : packageVersion.approvalStatus === 'approved'
                  ? `<a class="button-secondary" href="/admin/packages/${escapeHtml(
                      packageVersion.appId,
                    )}/versions/${escapeHtml(packageVersion.version)}/preview">Test launch</a>`
                  : `<a class="button-secondary" href="/admin/packages/${escapeHtml(
                      packageVersion.appId,
                    )}/versions/${escapeHtml(
                      packageVersion.version,
                    )}/preview">Test pending version</a>`
            }
          </section>
          <section class="fact">
            <span class="fact-label">Selected context</span>
            <p class="micro muted">${escapeHtml(formatSelectedContext(run.selectedContext))}</p>
          </section>
        </aside>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">App brief</p>
        ${
          run.appPlan === null
            ? '<p class="line-copy">No plan was recorded.</p>'
            : `<div class="line-list">
                <article class="line-item">
                  <p class="line-title">${escapeHtml(run.appPlan.title)}</p>
                  <p class="line-copy">${escapeHtml(run.appPlan.description)}</p>
                </article>
                <article class="line-item">
                  <p class="line-title">Learning goal</p>
                  <p class="line-copy">${escapeHtml(run.appPlan.learningGoal)}</p>
                </article>
                <article class="line-item">
                  <p class="line-title">Capabilities</p>
                  <p class="line-copy">${escapeHtml(run.appPlan.capabilities.join(', '))}</p>
                </article>
              </div>`
        }
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Validation and preview</p>
        ${renderPreviewSummary(workspace)}
        ${renderFindings(run)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Generated files</p>
        ${renderGeneratedFilesSummary({ workspace, packageVersion })}
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Generation plan</p>
        ${renderGenerationPlan(workspace)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Model request metadata</p>
        ${renderModelRequestMetadata(run)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Activity</p>
        ${renderActivity(run, input.activityEvents ?? [])}
      </div>
    </section>
    ${renderGeneratedPackageRuntimeLog({
      packageVersion,
      workspace,
      latestPreviewSession,
      previewEvidence,
    })}
    ${refreshWhileRunning ? renderGenerationRefreshScript(run.generationId) : ''}`,
  });
}
