import type {
  AppGenerationRunRecord,
  AppGenerationStatus,
  AppGenerationWorkspaceRecord,
} from '../app_writer/types.ts';
import type {
  AuditEventRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from '../package_review/types.ts';
import { type AdminNotice, escapeHtml, formatDateTime, renderAdminLayout } from './layout.ts';

export function renderAppWriterPage(
  input: {
    notice?: AdminNotice | null;
    audience?: string;
    contentSummary?: string;
    gradingMode?: string;
    promptText?: string;
    requestedAppId?: string;
  } = {},
): string {
  return renderAdminLayout({
    title: 'Lantern App Writer',
    eyebrow: 'App writer',
    heading: 'Create app with AI',
    intro:
      'Generate a reviewed learning app package inside Lantern boundaries, then inspect it before approval.',
    activePath: '/admin/app-writer',
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body stack">
        <div class="stack">
          <p class="section-label">Generation request</p>
          <h2>Describe the learning app</h2>
          <p class="line-copy">Lantern will select a starter, generate package files, validate them, run preview checks, and save a pending version.</p>
        </div>
        <form class="stack app-writer-form" method="post" action="/admin/app-writer" data-app-writer-form>
          <label class="field">
            <span>Prompt</span>
            <textarea name="promptText" rows="8" required>${escapeHtml(
              input.promptText ?? '',
            )}</textarea>
          </label>
          <label class="field">
            <span>Audience</span>
            <input name="audience" value="${escapeHtml(
              input.audience ?? '',
            )}" placeholder="Grade 4 algebra students">
          </label>
          <label class="field">
            <span>Content</span>
            <textarea name="contentSummary" rows="4" placeholder="Vocabulary list, concepts, source passage, or practice items">${escapeHtml(
              input.contentSummary ?? '',
            )}</textarea>
          </label>
          <label class="field">
            <span>Grading</span>
            <select name="gradingMode">
              ${renderGradingOption('', 'Let Lantern decide', input.gradingMode ?? '')}
              ${renderGradingOption('completion', 'Completion', input.gradingMode ?? '')}
              ${renderGradingOption('declarative', 'Declarative rubric', input.gradingMode ?? '')}
              ${renderGradingOption('browser', 'Browser autograder', input.gradingMode ?? '')}
            </select>
          </label>
          <label class="field">
            <span>Requested app ID</span>
            <input name="requestedAppId" value="${escapeHtml(
              input.requestedAppId ?? '',
            )}" placeholder="optional-app-id">
          </label>
          <div class="button-row">
            <button class="button-primary app-writer-submit-button" type="submit" data-app-writer-submit>
              <span class="app-writer-submit-label">Generate app</span>
              <span class="app-writer-submit-busy-label">Generating app</span>
            </button>
            <a class="button-secondary" href="/admin/packages">Back to apps</a>
          </div>
          <p
            id="app-writer-submit-status"
            class="app-writer-submit-status"
            aria-live="polite"
            data-app-writer-submit-status
            hidden
          >Generating app. Lantern is calling the model, validating the package, and running preview checks.</p>
        </form>
      </div>
    </section>
    <script>
      (() => {
        const form = document.querySelector('[data-app-writer-form]');
        const submit = document.querySelector('[data-app-writer-submit]');
        const status = document.querySelector('[data-app-writer-submit-status]');

        if (!(form instanceof HTMLFormElement) || !(submit instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) {
          return;
        }

        form.addEventListener('submit', () => {
          if (!form.checkValidity()) {
            return;
          }

          form.classList.add('is-submitting');
          submit.disabled = true;
          submit.setAttribute('aria-busy', 'true');
          status.hidden = false;
        });
      })();
    </script>`,
  });
}

function renderGradingOption(value: string, label: string, selectedValue: string): string {
  const selected = value === selectedValue ? ' selected' : '';

  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

export function renderAppGenerationRunPage(input: {
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
                    )}">Review before test launch</a>`
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
        <p class="section-label">Plan</p>
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
      latestPreviewSession,
      previewEvidence,
    })}
    ${refreshWhileRunning ? renderGenerationRefreshScript(run.generationId, run.updatedAt) : ''}`,
  });
}

function renderGenerationProgress(status: AppGenerationStatus): string {
  const steps: Array<{
    status: AppGenerationStatus;
    label: string;
  }> = [
    { status: 'started', label: 'Started' },
    { status: 'initializing', label: 'Initializing' },
    { status: 'planning', label: 'Planning' },
    { status: 'generating_package', label: 'Generating' },
    { status: 'validating', label: 'Validating' },
    { status: 'previewing', label: 'Previewing' },
    { status: 'saved_pending_version', label: 'Saved' },
  ];
  const activeIndex = progressIndexForStatus(status);

  return `<ol class="generation-progress" aria-label="Generation progress">
    ${steps
      .map((step, index) => {
        const stateClass =
          index < activeIndex ? 'is-complete' : index === activeIndex ? 'is-current' : 'is-pending';

        return `<li class="${stateClass}" aria-current="${
          index === activeIndex ? 'step' : 'false'
        }">
          <span class="generation-progress-marker"></span>
          <span>${escapeHtml(step.label)}</span>
        </li>`;
      })
      .join('')}
  </ol>`;
}

function renderGenerationRefreshScript(generationId: string, updatedAt: string): string {
  const eventUrl = `/admin/app-writer/runs/${escapeHtml(generationId)}/events`;
  const currentUpdatedAt = JSON.stringify(updatedAt);

  return `<script>
    let reloaded = false;
    const reloadOnce = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    if ('EventSource' in window) {
      const events = new EventSource('${eventUrl}');
      events.addEventListener('snapshot', (event) => {
        try {
          const snapshot = JSON.parse(event.data);
          if (snapshot.status === 'failed' || snapshot.status === 'saved_pending_version') {
            events.close();
            reloadOnce();
            return;
          }

          if (snapshot.updatedAt && snapshot.updatedAt !== ${currentUpdatedAt}) {
            reloadOnce();
          }
        } catch (_error) {
          reloadOnce();
        }
      });
      events.onerror = () => {
        events.close();
        window.setTimeout(reloadOnce, 3000);
      };
    } else {
      window.setTimeout(reloadOnce, 3000);
    }
  </script>`;
}

function isActiveGenerationStatus(status: AppGenerationStatus): boolean {
  return (
    status === 'started' ||
    status === 'initializing' ||
    status === 'normalizing' ||
    status === 'planning' ||
    status === 'generating_package' ||
    status === 'validating' ||
    status === 'repairing' ||
    status === 'previewing'
  );
}

function progressIndexForStatus(status: AppGenerationStatus): number {
  if (status === 'failed') {
    return -1;
  }

  if (status === 'normalizing') {
    return 2;
  }

  if (status === 'repairing') {
    return 4;
  }

  const ordered: AppGenerationStatus[] = [
    'started',
    'initializing',
    'planning',
    'generating_package',
    'validating',
    'previewing',
    'saved_pending_version',
  ];

  return ordered.indexOf(status);
}

function renderGeneratedFilesSummary(input: {
  workspace: AppGenerationWorkspaceRecord | null;
  packageVersion: PackageVersionRecord | null;
}): string {
  if (input.workspace !== null) {
    const fileRows = input.workspace.files.map((file) => ({
      label: file.path,
      path: `${formatWorkspaceFileRole(file.role)} · ${file.contents.length} characters`,
    }));

    return `<div class="line-list">
      ${fileRows
        .map(
          (row) =>
            `<article class="line-item">
            <p class="line-title">${escapeHtml(row.label)}</p>
            <p class="line-copy">${escapeHtml(row.path)}</p>
          </article>`,
        )
        .join('')}
    </div>
    <p class="micro muted">Workspace captured after repair attempt ${escapeHtml(
      String(input.workspace.repairAttemptCount),
    )}; ${escapeHtml(
      String(input.workspace.validationFindings.length),
    )} validation or preview findings currently attached.</p>
    ${
      input.packageVersion === null
        ? '<p class="micro muted">No immutable package version has been saved yet.</p>'
        : `<p class="micro muted">Saved package checksum ${escapeHtml(
            input.packageVersion.artifact.digest,
          )}.</p>`
    }`;
  }

  if (input.packageVersion === null) {
    return '<p class="line-copy">No generated workspace files were recorded yet.</p>';
  }

  const contentFiles = readManifestStringArray(input.packageVersion.manifestJson, 'content_files');
  const preview = readManifestRecord(input.packageVersion.manifestJson, 'preview');
  const previewFiles = [
    readManifestString(preview, 'fixtures_file'),
    readManifestString(preview, 'tests_file'),
  ].filter((path): path is string => path !== null);
  const fileRows: Array<{ label: string; path: string }> = [
    { label: 'Manifest', path: input.packageVersion.artifact.manifestPath },
    { label: 'Entrypoint', path: input.packageVersion.entrypoint },
    ...contentFiles.map((path) => ({ label: 'Content', path })),
    ...previewFiles.map((path) => ({ label: 'Preview', path })),
    {
      label: 'Artifact root',
      path: input.packageVersion.artifact.snapshotRoot,
    },
  ];

  return `<div class="line-list">
    ${fileRows
      .map(
        (row) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(row.label)}</p>
          <p class="line-copy">${escapeHtml(row.path)}</p>
        </article>`,
      )
      .join('')}
  </div>
  <p class="micro muted">Checksum ${escapeHtml(input.packageVersion.artifact.digest)}.</p>`;
}

function renderGenerationPlan(workspace: AppGenerationWorkspaceRecord | null): string {
  if (workspace === null || workspace.generationPlan.length === 0) {
    return '<p class="line-copy">No generation plan has been recorded yet.</p>';
  }

  return `<div class="line-list">
    ${workspace.generationPlan
      .map(
        (step) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(
            formatProgressStage(step.id),
          )} <span class="status-badge status-pending">${escapeHtml(step.status)}</span></p>
          <p class="line-copy">${escapeHtml(step.summary)}</p>
          <p class="micro muted">${escapeHtml(String(step.diagnosticCount))} diagnostics.</p>
        </article>`,
      )
      .join('')}
  </div>`;
}

function formatWorkspaceFileRole(role: string | undefined): string {
  return role ?? 'package';
}

function renderModelRequestMetadata(run: AppGenerationRunRecord): string {
  if (run.modelRequestMetadata.length === 0) {
    return '<p class="line-copy">No model request metadata was recorded for this run.</p>';
  }

  return `<div class="line-list">
    ${run.modelRequestMetadata
      .map(
        (metadata) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(metadata.provider)}${
            metadata.model === null ? '' : ` · ${escapeHtml(metadata.model)}`
          }</p>
          <p class="line-copy">Request ${escapeHtml(
            metadata.requestId ?? 'not provided',
          )}; ${escapeHtml(
            formatNullableNumber(metadata.responseCharacters),
          )} characters; ${escapeHtml(formatNullableNumber(metadata.durationMs))} ms.</p>
        </article>`,
      )
      .join('')}
  </div>`;
}

function renderFindings(run: AppGenerationRunRecord): string {
  if (run.validationFindings.length === 0) {
    return '<p class="line-copy">No validation or preview findings were recorded.</p>';
  }

  return `<div class="line-list">
    ${run.validationFindings
      .map(
        (finding) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(finding.code)}</p>
          <p class="line-copy">${escapeHtml(finding.message)}</p>
          ${
            finding.fix === null ? '' : `<p class="micro muted">Fix: ${escapeHtml(finding.fix)}</p>`
          }
        </article>`,
      )
      .join('')}
  </div>`;
}

function readManifestRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];

  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readManifestString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === 'string' ? value : null;
}

function readManifestStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'unknown' : String(value);
}

function renderActivity(run: AppGenerationRunRecord, events: AuditEventRecord[]): string {
  if (events.length === 0) {
    const fallbackEvents = [
      `Created run ${run.generationId}`,
      `Selected ${run.selectedStarterId ?? 'no'} starter`,
      `Current status is ${formatStatus(run.status)}`,
      run.packageVersionId === null
        ? 'No package version saved yet'
        : `Saved pending package version ${run.packageVersionId}`,
    ];

    return `<ol>
      ${fallbackEvents.map((event) => `<li>${escapeHtml(event)}</li>`).join('')}
    </ol>`;
  }

  return `<ol>
    ${events.map((event) => `<li>${renderActivityEvent(event)}</li>`).join('')}
  </ol>`;
}

function renderActivityEvent(event: AuditEventRecord): string {
  const progressStage = readAuditString(event.detail, 'modelProgressStage');
  const progressLabel =
    progressStage === null
      ? ''
      : ` <span class="status-badge status-pending">${escapeHtml(
          formatProgressStage(progressStage),
        )}</span>`;

  return `<strong>${escapeHtml(
    formatDateTime(event.occurredAt),
  )}</strong>${progressLabel} ${escapeHtml(event.summary)}`;
}

function renderGeneratedPackageRuntimeLog(input: {
  packageVersion: PackageVersionRecord | null;
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
}): string {
  if (input.packageVersion === null) {
    return '';
  }

  const previewHref = `/admin/packages/${escapeHtml(
    input.packageVersion.appId,
  )}/versions/${escapeHtml(input.packageVersion.version)}/preview`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Runtime log</p>
        ${
          input.latestPreviewSession === null
            ? `<p class="line-copy">No runtime preview session has been recorded for this generated package yet.</p>
              <div class="button-row">
                <a class="button-secondary" href="${previewHref}">Open test launch</a>
              </div>`
            : `<p class="line-copy">Latest test launch <strong>${escapeHtml(
                input.latestPreviewSession.sessionId,
              )}</strong> ran as ${escapeHtml(
                input.latestPreviewSession.launch.userRole,
              )} in course <span class="inline-code">${escapeHtml(
                input.latestPreviewSession.launch.courseId,
              )}</span>.</p>
              ${renderPreviewEvidence(input.previewEvidence)}
              <div class="button-row">
                <a class="button-secondary" href="${previewHref}">Open full test launch log</a>
              </div>`
        }
      </div>
    </section>`;
}

function renderPreviewEvidence(records: PreviewEvidenceRecord[]): string {
  if (records.length === 0) {
    return '<p class="muted">No runtime gateway events have been recorded for this test launch yet.</p>';
  }

  return `<div class="line-list">
    ${records
      .map(
        (record) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(record.eventType)}${
            record.capability === null
              ? ''
              : ` <span class="inline-code">${escapeHtml(record.capability)}</span>`
          }</p>
          <p class="micro muted">${escapeHtml(formatDateTime(record.occurredAt))}</p>
          <p class="line-copy">${escapeHtml(record.summary)}</p>
        </article>`,
      )
      .join('')}
  </div>`;
}

function readAuditString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === 'string' ? value : null;
}

function formatProgressStage(stage: string): string {
  return stage.replaceAll('_', ' ');
}

function formatSelectedContext(context: Record<string, unknown>): string {
  const references = Array.isArray(context.referenceAppIds)
    ? context.referenceAppIds.filter((item): item is string => typeof item === 'string')
    : [];
  const recipe = formatAppWriterRecipe(context);
  const parts = [
    ...(recipe === null ? [] : [recipe]),
    references.length === 0 ? 'No references recorded.' : `References: ${references.join(', ')}`,
  ];

  return parts.join(' · ');
}

function formatAppWriterRecipe(context: Record<string, unknown>): string | null {
  const recipe = readUnknownRecord(context.recipe);
  const recipeId = readUnknownString(recipe?.recipeId);
  const recipeVersion = readUnknownString(recipe?.recipeVersion);

  if (recipeId === null || recipeVersion === null) {
    return null;
  }

  return `Recipe ${recipeId}@${recipeVersion}`;
}

function readUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readUnknownString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function formatStatus(status: AppGenerationRunRecord['status']): string {
  return status.replaceAll('_', ' ');
}
