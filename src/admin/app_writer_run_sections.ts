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
import { escapeHtml, formatDateTime } from './layout.ts';
import {
  formatNullableNumber,
  formatProgressStage,
  formatResultValue,
  formatStatus,
  formatWorkspaceFileRole,
  progressIndexForStatus,
  readAuditString,
  readPreviewStepResult,
  readUnknownNumber,
  selectCurrentGenerationPlanStep,
  statusClassForModelOutcome,
  statusClassForPlanStep,
} from './app_writer_run_view_model.ts';
import {
  readManifestRecord,
  readManifestString,
  readManifestStringArray,
  readUnknownString,
} from '../package_review/manifest_view.ts';

export function renderGenerationProgress(status: AppGenerationStatus): string {
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

export function renderLiveProgress(input: {
  run: AppGenerationRunRecord;
  workspace: AppGenerationWorkspaceRecord | null;
}): string {
  const currentStep = selectCurrentGenerationPlanStep(input.workspace);
  const modelAttempt = input.run.modelRequestMetadata.at(-1);

  return `<div class="line-list app-writer-live-progress" data-app-writer-live-progress>
    <article class="line-item">
      <p class="line-title">Live progress <span class="status-badge status-pending" data-app-writer-live-status>${escapeHtml(
        formatStatus(input.run.status),
      )}</span></p>
      <p class="line-copy" data-app-writer-live-step>${escapeHtml(
        currentStep === null
          ? 'No generation plan step is active yet.'
          : `${formatProgressStage(currentStep.id)}: ${currentStep.summary}`,
      )}</p>
      <p class="micro muted" data-app-writer-live-detail>${escapeHtml(
        [
          `Repairs ${input.run.repairAttemptCount}`,
          `Findings ${input.run.validationFindings.length}`,
          modelAttempt === undefined
            ? 'Model attempt unknown'
            : `Model ${modelAttempt.stage} attempt ${modelAttempt.attempt} ${modelAttempt.outcome}`,
        ].join(' · '),
      )}</p>
    </article>
  </div>`;
}

export function renderGenerationRefreshScript(generationId: string): string {
  const eventUrl = `/admin/app-writer/runs/${escapeHtml(generationId)}/events`;

  return `<script>
    let reloaded = false;
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement && typeof value === 'string') {
        element.textContent = value;
      }
    };
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

          setText('[data-app-writer-live-status]', String(snapshot.status || 'unknown').replaceAll('_', ' '));
          setText('[data-app-writer-live-step]', snapshot.currentPlanStepSummary || snapshot.lastActivitySummary || 'Lantern is working.');
          setText('[data-app-writer-live-detail]', [
            'Repairs ' + String(snapshot.repairAttemptCount ?? 0),
            'Findings ' + String(snapshot.validationFindingCount ?? 0),
            snapshot.currentModelStage
              ? 'Model ' + snapshot.currentModelStage + ' attempt ' + String(snapshot.currentModelAttempt ?? '?')
              : 'Model attempt unknown',
          ].join(' · '));
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

export function renderGeneratedFilesSummary(input: {
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
    { label: 'Entrypoint', path: input.packageVersion.runtime.entrypoint },
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

export function renderGenerationPlan(workspace: AppGenerationWorkspaceRecord | null): string {
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
          )} <span class="status-badge ${escapeHtml(
            statusClassForPlanStep(step.status),
          )}">${escapeHtml(step.status)}</span></p>
          <p class="line-copy">${escapeHtml(step.summary)}</p>
          <p class="micro muted">${escapeHtml(renderPlanStepTiming(step))} · ${escapeHtml(
            String(step.diagnosticCount),
          )} diagnostics.</p>
          ${renderPlanStepResult(step)}
        </article>`,
      )
      .join('')}
  </div>`;
}

export function renderPreviewSummary(workspace: AppGenerationWorkspaceRecord | null): string {
  const previewResult = readPreviewStepResult(workspace);

  if (previewResult === null) {
    return '<p class="line-copy">No preview assertion summary has been recorded yet.</p>';
  }

  return `<div class="line-list">
    <article class="line-item">
      <p class="line-title">Preview summary</p>
      <p class="line-copy">${escapeHtml(previewResult.summary)}</p>
      <p class="micro muted">${escapeHtml(
        `${previewResult.passedAssertionCount}/${previewResult.assertionCount} assertions passed · ${previewResult.runtimeLogCount} runtime log entries`,
      )}</p>
    </article>
  </div>`;
}

export function renderModelRequestMetadata(run: AppGenerationRunRecord): string {
  if (run.modelRequestMetadata.length === 0) {
    return '<p class="line-copy">No model request metadata was recorded for this run.</p>';
  }

  return `<div class="line-list">
    ${run.modelRequestMetadata
      .map(
        (metadata) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(metadata.stage)} attempt ${escapeHtml(
            String(metadata.attempt),
          )} <span class="status-badge ${escapeHtml(
            statusClassForModelOutcome(metadata.outcome),
          )}">${escapeHtml(metadata.outcome)}</span></p>
          <p class="line-copy">${escapeHtml(metadata.provider)}${
            metadata.model === null ? '' : ` · ${escapeHtml(metadata.model)}`
          }</p>
          <p class="micro muted">Request ${escapeHtml(
            metadata.requestId ?? 'not provided',
          )}; ${escapeHtml(
            formatNullableNumber(metadata.responseCharacters),
          )} characters; ${escapeHtml(formatNullableNumber(metadata.durationMs))} ms${
            metadata.errorCode === null ? '' : `; ${escapeHtml(metadata.errorCode)}`
          }.</p>
        </article>`,
      )
      .join('')}
  </div>`;
}

export function renderFindings(run: AppGenerationRunRecord): string {
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
          ${renderFindingDetail(finding)}
          ${
            finding.fix === null ? '' : `<p class="micro muted">Fix: ${escapeHtml(finding.fix)}</p>`
          }
        </article>`,
      )
      .join('')}
  </div>`;
}

export function renderActivity(run: AppGenerationRunRecord, events: AuditEventRecord[]): string {
  if (events.length === 0) {
    const emptyStateEvents = [
      `Created run ${run.generationId}`,
      `Selected ${run.selectedStarterId ?? 'no'} starter`,
      `Current status is ${formatStatus(run.status)}`,
      run.packageVersionId === null
        ? 'No package version saved yet'
        : `Saved pending package version ${run.packageVersionId}`,
    ];

    return `<ol>
      ${emptyStateEvents.map((event) => `<li>${escapeHtml(event)}</li>`).join('')}
    </ol>`;
  }

  return `<ol>
    ${events.map((event) => `<li>${renderActivityEvent(event)}</li>`).join('')}
  </ol>`;
}

export function renderGeneratedPackageRuntimeLog(input: {
  packageVersion: PackageVersionRecord | null;
  workspace: AppGenerationWorkspaceRecord | null;
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
            ? `<p class="line-copy">${escapeHtml(
                readPreviewStepResult(input.workspace) === null
                  ? 'No manual runtime preview session has been recorded for this generated package yet.'
                  : `Generation preview completed: ${
                      readPreviewStepResult(input.workspace)?.summary ?? ''
                    } No manual test launch has been opened yet.`,
              )}</p>
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

function renderPlanStepTiming(
  step: AppGenerationWorkspaceRecord['generationPlan'][number],
): string {
  const started =
    step.startedAt === null ? 'not started' : `started ${formatDateTime(step.startedAt)}`;
  const completed =
    step.completedAt === null ? 'not completed' : `completed ${formatDateTime(step.completedAt)}`;

  return `${started}; ${completed}`;
}

function renderPlanStepResult(
  step: AppGenerationWorkspaceRecord['generationPlan'][number],
): string {
  const summary = readUnknownString(step.result.summary);

  if (typeof summary === 'string') {
    const assertionCount = readUnknownNumber(step.result.assertionCount);
    const passedAssertionCount = readUnknownNumber(step.result.passedAssertionCount);

    return `<p class="micro muted">${escapeHtml(
      assertionCount === null || passedAssertionCount === null
        ? summary
        : `${summary} Assertions ${passedAssertionCount}/${assertionCount}.`,
    )}</p>`;
  }

  const keys = Object.keys(step.result);

  if (keys.length === 0) {
    return '';
  }

  return `<p class="micro muted">Result: ${escapeHtml(
    keys
      .filter((key) => key !== 'runtimeLog')
      .slice(0, 4)
      .map((key) => `${key}=${formatResultValue(step.result[key])}`)
      .join(', '),
  )}</p>`;
}

function renderFindingDetail(
  finding: AppGenerationRunRecord['validationFindings'][number],
): string {
  const harnessError = readUnknownString(finding.detail.harnessError);
  const modelRequestCount = readUnknownNumber(finding.detail.modelRequestCount);

  if (harnessError === null && modelRequestCount === null) {
    return '';
  }

  return `<p class="micro muted">Detail: ${escapeHtml(
    [
      harnessError === null ? null : `harness=${harnessError}`,
      modelRequestCount === null ? null : `model requests=${modelRequestCount}`,
    ]
      .filter((part): part is string => part !== null)
      .join(', '),
  )}</p>`;
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
