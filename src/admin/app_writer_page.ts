import type {
  AppGenerationPlanningResult,
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
          <p class="line-copy">Lantern first shows a deterministic app plan. The model is not called until you confirm the plan.</p>
        </div>
        <form class="stack app-writer-form" method="post" action="/admin/app-writer" data-app-writer-form>
          ${renderAppWriterRequestFields(input)}
          <div class="button-row">
            <button class="button-primary app-writer-submit-button" type="submit" name="appWriterAction" value="preview" data-app-writer-submit>
              <span class="app-writer-submit-label">Preview plan</span>
              <span class="app-writer-submit-busy-label">Preparing plan</span>
            </button>
            <a class="button-secondary" href="/admin/packages">Back to apps</a>
          </div>
          <p
            id="app-writer-submit-status"
            class="app-writer-submit-status"
            aria-live="polite"
            data-app-writer-submit-status
            hidden
          >Preparing a deterministic app plan. Lantern is not calling the model yet.</p>
        </form>
      </div>
    </section>
    ${renderAppWriterSubmitScript()}`,
  });
}

export function renderAppWriterPlanPreviewPage(input: {
  audience?: string;
  contentSummary?: string;
  gradingMode?: string;
  promptText?: string;
  requestedAppId?: string;
  planning: AppGenerationPlanningResult;
  selectedContext: Record<string, unknown>;
  notice?: AdminNotice | null;
}): string {
  return renderAdminLayout({
    title: 'Lantern App Writer Plan',
    eyebrow: 'App writer',
    heading: 'Review app plan',
    intro: 'Confirm or revise the deterministic plan before Lantern calls the model.',
    activePath: '/admin/app-writer',
    breadcrumbs: [{ label: 'App writer', href: '/admin/app-writer' }, { label: 'Plan preview' }],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Deterministic plan</p>
          <h2>${escapeHtml(input.planning.appPlan.title)}</h2>
          <p>${escapeHtml(input.planning.appPlan.description)}</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">App type</span>
              <span class="fact-value">${
      escapeHtml(formatProgressStage(input.planning.appPlan.activityType))
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Starter</span>
              <span class="fact-value">${escapeHtml(input.planning.selectedStarterId)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Grading</span>
              <span class="fact-value">${escapeHtml(input.planning.appPlan.grading.mode)}</span>
              <p class="micro muted">${
      escapeHtml(input.planning.appPlan.grading.scoringSummary)
    }</p>
            </div>
            <div class="fact">
              <span class="fact-label">Local state</span>
              <span class="fact-value">${escapeHtml(formatLocalStatePlan(input.planning))}</span>
            </div>
          </div>
          ${renderPlanPreviewDetails(input.planning)}
        </div>
        <aside class="stack">
          <section class="fact">
            <span class="fact-label">Model spend</span>
            <strong class="fact-value">Not started</strong>
            <p class="micro muted">Lantern has only used deterministic planning. The harness authors files after you confirm.</p>
          </section>
          <section class="fact">
            <span class="fact-label">Selected context</span>
            <p class="micro muted">${escapeHtml(formatSelectedContext(input.selectedContext))}</p>
          </section>
          <section class="fact">
            <span class="fact-label">App ID</span>
            <strong class="fact-value">${escapeHtml(input.planning.appPlan.appId)}</strong>
          </section>
        </aside>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <div class="stack">
          <p class="section-label">Revise or confirm</p>
          <h2>Update the request before generation</h2>
          <p class="line-copy">Change the prompt and preview the plan again, or confirm this plan to start the App Writer harness.</p>
        </div>
        <form class="stack app-writer-form" method="post" action="/admin/app-writer" data-app-writer-form>
          ${renderAppWriterRequestFields(input)}
          <div class="button-row">
            <button class="button-secondary app-writer-submit-button" type="submit" name="appWriterAction" value="preview" data-app-writer-submit>
              <span class="app-writer-submit-label">Update plan</span>
              <span class="app-writer-submit-busy-label">Updating plan</span>
            </button>
            <button class="button-primary app-writer-submit-button" type="submit" name="appWriterAction" value="generate" data-app-writer-submit>
              <span class="app-writer-submit-label">Generate app</span>
              <span class="app-writer-submit-busy-label">Generating app</span>
            </button>
            <a class="button-secondary" href="/admin/app-writer">Start over</a>
          </div>
          <p
            id="app-writer-submit-status"
            class="app-writer-submit-status"
            aria-live="polite"
            data-app-writer-submit-status
            hidden
          >Working on this request.</p>
        </form>
      </div>
    </section>
    ${renderAppWriterSubmitScript()}`,
  });
}

function renderAppWriterRequestFields(input: {
  audience?: string;
  contentSummary?: string;
  gradingMode?: string;
  promptText?: string;
  requestedAppId?: string;
}): string {
  return `<label class="field">
    <span>Prompt</span>
    <textarea name="promptText" rows="8" required>${escapeHtml(input.promptText ?? '')}</textarea>
  </label>
  <label class="field">
    <span>Audience</span>
    <input name="audience" value="${
    escapeHtml(input.audience ?? '')
  }" placeholder="Grade 4 algebra students">
  </label>
  <label class="field">
    <span>Content</span>
    <textarea name="contentSummary" rows="4" placeholder="Vocabulary list, concepts, source passage, or practice items">${
    escapeHtml(
      input.contentSummary ?? '',
    )
  }</textarea>
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
    <input name="requestedAppId" value="${
    escapeHtml(input.requestedAppId ?? '')
  }" placeholder="optional-app-id">
  </label>`;
}

function renderPlanPreviewDetails(planning: AppGenerationPlanningResult): string {
  return `<div class="line-list">
    <article class="line-item">
      <p class="line-title">Capabilities</p>
      <p class="line-copy">${escapeHtml(planning.appPlan.capabilities.join(', '))}</p>
    </article>
    <article class="line-item">
      <p class="line-title">Attempt events</p>
      ${renderAttemptEventPlan(planning)}
    </article>
    <article class="line-item">
      <p class="line-title">Preview assertions</p>
      ${renderStringList(planning.appPlan.previewTests)}
    </article>
    <article class="line-item">
      <p class="line-title">Learner flow</p>
      ${renderStringList(planning.appPlan.learnerFlow)}
    </article>
    <article class="line-item">
      <p class="line-title">Boundary notes</p>
      ${renderStringList(planning.appPlan.riskNotes)}
    </article>
  </div>`;
}

function renderAttemptEventPlan(planning: AppGenerationPlanningResult): string {
  if (planning.appPlan.attemptEvents.length === 0) {
    return '<p class="line-copy">No attempt events planned for this app type.</p>';
  }

  return `<ul>
    ${
    planning.appPlan.attemptEvents
      .map(
        (event) =>
          `<li><strong>${escapeHtml(event.eventType)}</strong>: ${
            escapeHtml(event.when)
          } <span class="micro muted">${
            escapeHtml(
              event.questionIdPattern,
            )
          }</span></li>`,
      )
      .join('')
  }
  </ul>`;
}

function renderStringList(items: readonly string[]): string {
  if (items.length === 0) {
    return '<p class="line-copy">None planned.</p>';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function formatLocalStatePlan(planning: AppGenerationPlanningResult): string {
  return planning.appPlan.capabilities.includes('write_local_state')
    ? 'GatewayApp local progress'
    : 'Not planned';
}

function renderAppWriterSubmitScript(): string {
  return `<script>
      (() => {
        const form = document.querySelector('[data-app-writer-form]');
        const status = document.querySelector('[data-app-writer-submit-status]');

        if (!(form instanceof HTMLFormElement) || !(status instanceof HTMLElement)) {
          return;
        }

        form.addEventListener('submit', (event) => {
          if (!form.checkValidity()) {
            return;
          }

          const submitter = event.submitter;

          if (!(submitter instanceof HTMLButtonElement)) {
            return;
          }

          form.classList.add('is-submitting');
          submitter.disabled = true;
          submitter.setAttribute('aria-busy', 'true');
          status.hidden = false;
          status.textContent = submitter.value === 'generate'
            ? 'Generating app. Lantern is calling the model, validating the package, and running preview checks.'
            : 'Preparing a deterministic app plan. Lantern is not calling the model yet.';
        });
      })();
    </script>`;
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
          ${renderLiveProgress({ run, workspace })}
          ${
      refreshWhileRunning
        ? `<p class="line-copy">Lantern is still working. This page refreshes while generation runs, and the run URL can be reopened later.</p>
                <div class="button-row">
                  <a class="button-secondary" href="/admin/app-writer/runs/${
          escapeHtml(
            run.generationId,
          )
        }">Refresh status</a>
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
        : `<a class="button-secondary" href="/admin/packages/${
          escapeHtml(
            packageVersion.appId,
          )
        }/versions/${escapeHtml(packageVersion.version)}">${
          escapeHtml(
            packageVersion.approvalStatus === 'approved'
              ? 'Open approved version'
              : 'Open pending version',
          )
        }</a>`
    }
          </section>
          <section class="fact">
            <span class="fact-label">Preview action</span>
            ${
      packageVersion === null
        ? '<strong class="fact-value">Not available</strong><p class="micro muted">Lantern saves previewable packages only after validation and preview checks pass.</p>'
        : packageVersion.approvalStatus === 'approved'
        ? `<a class="button-secondary" href="/admin/packages/${
          escapeHtml(
            packageVersion.appId,
          )
        }/versions/${escapeHtml(packageVersion.version)}/preview">Test launch</a>`
        : `<a class="button-secondary" href="/admin/packages/${
          escapeHtml(
            packageVersion.appId,
          )
        }/versions/${
          escapeHtml(
            packageVersion.version,
          )
        }/preview">Test pending version</a>`
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
    ${
      renderGeneratedPackageRuntimeLog({
        packageVersion,
        workspace,
        latestPreviewSession,
        previewEvidence,
      })
    }
    ${refreshWhileRunning ? renderGenerationRefreshScript(run.generationId) : ''}`,
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
    ${
    steps
      .map((step, index) => {
        const stateClass = index < activeIndex
          ? 'is-complete'
          : index === activeIndex
          ? 'is-current'
          : 'is-pending';

        return `<li class="${stateClass}" aria-current="${
          index === activeIndex ? 'step' : 'false'
        }">
          <span class="generation-progress-marker"></span>
          <span>${escapeHtml(step.label)}</span>
        </li>`;
      })
      .join('')
  }
  </ol>`;
}

function renderLiveProgress(input: {
  run: AppGenerationRunRecord;
  workspace: AppGenerationWorkspaceRecord | null;
}): string {
  const currentStep = selectCurrentGenerationPlanStep(input.workspace);
  const modelAttempt = input.run.modelRequestMetadata.at(-1);

  return `<div class="line-list app-writer-live-progress" data-app-writer-live-progress>
    <article class="line-item">
      <p class="line-title">Live progress <span class="status-badge status-pending" data-app-writer-live-status>${
    escapeHtml(
      formatStatus(input.run.status),
    )
  }</span></p>
      <p class="line-copy" data-app-writer-live-step>${
    escapeHtml(
      currentStep === null
        ? 'No generation plan step is active yet.'
        : `${formatProgressStage(currentStep.id)}: ${currentStep.summary}`,
    )
  }</p>
      <p class="micro muted" data-app-writer-live-detail>${
    escapeHtml(
      [
        `Repairs ${input.run.repairAttemptCount}`,
        `Findings ${input.run.validationFindings.length}`,
        modelAttempt === undefined
          ? 'Model attempt unknown'
          : `Model ${modelAttempt.stage} attempt ${modelAttempt.attempt} ${modelAttempt.outcome}`,
      ].join(' · '),
    )
  }</p>
    </article>
  </div>`;
}

function renderGenerationRefreshScript(generationId: string): string {
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
      ${
      fileRows
        .map(
          (row) =>
            `<article class="line-item">
            <p class="line-title">${escapeHtml(row.label)}</p>
            <p class="line-copy">${escapeHtml(row.path)}</p>
          </article>`,
        )
        .join('')
    }
    </div>
    <p class="micro muted">Workspace captured after repair attempt ${
      escapeHtml(
        String(input.workspace.repairAttemptCount),
      )
    }; ${
      escapeHtml(
        String(input.workspace.validationFindings.length),
      )
    } validation or preview findings currently attached.</p>
    ${
      input.packageVersion === null
        ? '<p class="micro muted">No immutable package version has been saved yet.</p>'
        : `<p class="micro muted">Saved package checksum ${
          escapeHtml(
            input.packageVersion.artifact.digest,
          )
        }.</p>`
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
    ${
    fileRows
      .map(
        (row) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(row.label)}</p>
          <p class="line-copy">${escapeHtml(row.path)}</p>
        </article>`,
      )
      .join('')
  }
  </div>
  <p class="micro muted">Checksum ${escapeHtml(input.packageVersion.artifact.digest)}.</p>`;
}

function renderGenerationPlan(workspace: AppGenerationWorkspaceRecord | null): string {
  if (workspace === null || workspace.generationPlan.length === 0) {
    return '<p class="line-copy">No generation plan has been recorded yet.</p>';
  }

  return `<div class="line-list">
    ${
    workspace.generationPlan
      .map(
        (step) =>
          `<article class="line-item">
          <p class="line-title">${
            escapeHtml(
              formatProgressStage(step.id),
            )
          } <span class="status-badge ${
            escapeHtml(
              statusClassForPlanStep(step.status),
            )
          }">${escapeHtml(step.status)}</span></p>
          <p class="line-copy">${escapeHtml(step.summary)}</p>
          <p class="micro muted">${escapeHtml(renderPlanStepTiming(step))} · ${
            escapeHtml(
              String(step.diagnosticCount),
            )
          } diagnostics.</p>
          ${renderPlanStepResult(step)}
        </article>`,
      )
      .join('')
  }
  </div>`;
}

function renderPreviewSummary(workspace: AppGenerationWorkspaceRecord | null): string {
  const previewResult = readPreviewStepResult(workspace);

  if (previewResult === null) {
    return '<p class="line-copy">No preview assertion summary has been recorded yet.</p>';
  }

  return `<div class="line-list">
    <article class="line-item">
      <p class="line-title">Preview summary</p>
      <p class="line-copy">${escapeHtml(previewResult.summary)}</p>
      <p class="micro muted">${
    escapeHtml(
      `${previewResult.passedAssertionCount}/${previewResult.assertionCount} assertions passed · ${previewResult.runtimeLogCount} runtime log entries`,
    )
  }</p>
    </article>
  </div>`;
}

function renderPlanStepTiming(
  step: AppGenerationWorkspaceRecord['generationPlan'][number],
): string {
  const started = step.startedAt === null
    ? 'not started'
    : `started ${formatDateTime(step.startedAt)}`;
  const completed = step.completedAt === null
    ? 'not completed'
    : `completed ${formatDateTime(step.completedAt)}`;

  return `${started}; ${completed}`;
}

function renderPlanStepResult(
  step: AppGenerationWorkspaceRecord['generationPlan'][number],
): string {
  const summary = readUnknownString(step.result.summary);

  if (typeof summary === 'string') {
    const assertionCount = readUnknownNumber(step.result.assertionCount);
    const passedAssertionCount = readUnknownNumber(step.result.passedAssertionCount);

    return `<p class="micro muted">${
      escapeHtml(
        assertionCount === null || passedAssertionCount === null
          ? summary
          : `${summary} Assertions ${passedAssertionCount}/${assertionCount}.`,
      )
    }</p>`;
  }

  const keys = Object.keys(step.result);

  if (keys.length === 0) {
    return '';
  }

  return `<p class="micro muted">Result: ${
    escapeHtml(
      keys
        .filter((key) => key !== 'runtimeLog')
        .slice(0, 4)
        .map((key) => `${key}=${formatResultValue(step.result[key])}`)
        .join(', '),
    )
  }</p>`;
}

function statusClassForPlanStep(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'status-approved';
    case 'failed':
      return 'status-rejected';
    case 'running':
      return 'status-pending';
    default:
      return 'status-pending';
  }
}

function selectCurrentGenerationPlanStep(
  workspace: AppGenerationWorkspaceRecord | null,
): AppGenerationWorkspaceRecord['generationPlan'][number] | null {
  if (workspace === null) {
    return null;
  }

  return (
    workspace.generationPlan.find((step) => step.status === 'running') ??
      workspace.generationPlan.find((step) => step.status === 'failed') ??
      [...workspace.generationPlan].reverse().find((step) => step.status !== 'pending') ??
      null
  );
}

function readPreviewStepResult(workspace: AppGenerationWorkspaceRecord | null): {
  assertionCount: number;
  passedAssertionCount: number;
  runtimeLogCount: number;
  summary: string;
} | null {
  const step = workspace?.generationPlan.find((candidate) => candidate.id === 'preview_runtime');

  if (step === undefined) {
    return null;
  }

  const assertionCount = readUnknownNumber(step.result.assertionCount);
  const passedAssertionCount = readUnknownNumber(step.result.passedAssertionCount);
  const runtimeLogCount = readUnknownNumber(step.result.runtimeLogCount);
  const summary = readUnknownString(step.result.summary);

  if (
    assertionCount === null ||
    passedAssertionCount === null ||
    runtimeLogCount === null ||
    summary === null
  ) {
    return null;
  }

  return {
    assertionCount,
    passedAssertionCount,
    runtimeLogCount,
    summary,
  };
}

function readUnknownNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatResultValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (typeof value === 'object') {
    return 'object';
  }

  return 'unknown';
}

function formatWorkspaceFileRole(role: string | undefined): string {
  return role ?? 'package';
}

function renderModelRequestMetadata(run: AppGenerationRunRecord): string {
  if (run.modelRequestMetadata.length === 0) {
    return '<p class="line-copy">No model request metadata was recorded for this run.</p>';
  }

  return `<div class="line-list">
    ${
    run.modelRequestMetadata
      .map(
        (metadata) =>
          `<article class="line-item">
          <p class="line-title">${escapeHtml(metadata.stage)} attempt ${
            escapeHtml(
              String(metadata.attempt),
            )
          } <span class="status-badge ${
            escapeHtml(
              statusClassForModelOutcome(metadata.outcome),
            )
          }">${escapeHtml(metadata.outcome)}</span></p>
          <p class="line-copy">${escapeHtml(metadata.provider)}${
            metadata.model === null ? '' : ` · ${escapeHtml(metadata.model)}`
          }</p>
          <p class="micro muted">Request ${
            escapeHtml(
              metadata.requestId ?? 'not provided',
            )
          }; ${
            escapeHtml(
              formatNullableNumber(metadata.responseCharacters),
            )
          } characters; ${escapeHtml(formatNullableNumber(metadata.durationMs))} ms${
            metadata.errorCode === null ? '' : `; ${escapeHtml(metadata.errorCode)}`
          }.</p>
        </article>`,
      )
      .join('')
  }
  </div>`;
}

function statusClassForModelOutcome(outcome: string): string {
  switch (outcome) {
    case 'succeeded':
      return 'status-approved';
    case 'failed':
    case 'timed_out':
      return 'status-rejected';
    default:
      return 'status-pending';
  }
}

function renderFindings(run: AppGenerationRunRecord): string {
  if (run.validationFindings.length === 0) {
    return '<p class="line-copy">No validation or preview findings were recorded.</p>';
  }

  return `<div class="line-list">
    ${
    run.validationFindings
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
      .join('')
  }
  </div>`;
}

function renderFindingDetail(
  finding: AppGenerationRunRecord['validationFindings'][number],
): string {
  const harnessError = readUnknownString(finding.detail.harnessError);
  const modelRequestCount = readUnknownNumber(finding.detail.modelRequestCount);

  if (harnessError === null && modelRequestCount === null) {
    return '';
  }

  return `<p class="micro muted">Detail: ${
    escapeHtml(
      [
        harnessError === null ? null : `harness=${harnessError}`,
        modelRequestCount === null ? null : `model requests=${modelRequestCount}`,
      ]
        .filter((part): part is string => part !== null)
        .join(', '),
    )
  }</p>`;
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

function renderActivityEvent(event: AuditEventRecord): string {
  const progressStage = readAuditString(event.detail, 'modelProgressStage');
  const progressLabel = progressStage === null
    ? ''
    : ` <span class="status-badge status-pending">${
      escapeHtml(
        formatProgressStage(progressStage),
      )
    }</span>`;

  return `<strong>${
    escapeHtml(
      formatDateTime(event.occurredAt),
    )
  }</strong>${progressLabel} ${escapeHtml(event.summary)}`;
}

function renderGeneratedPackageRuntimeLog(input: {
  packageVersion: PackageVersionRecord | null;
  workspace: AppGenerationWorkspaceRecord | null;
  latestPreviewSession: PreviewSessionRecord | null;
  previewEvidence: PreviewEvidenceRecord[];
}): string {
  if (input.packageVersion === null) {
    return '';
  }

  const previewHref = `/admin/packages/${
    escapeHtml(
      input.packageVersion.appId,
    )
  }/versions/${escapeHtml(input.packageVersion.version)}/preview`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Runtime log</p>
        ${
    input.latestPreviewSession === null
      ? `<p class="line-copy">${
        escapeHtml(
          readPreviewStepResult(input.workspace) === null
            ? 'No manual runtime preview session has been recorded for this generated package yet.'
            : `Generation preview completed: ${
              readPreviewStepResult(input.workspace)?.summary ?? ''
            } No manual test launch has been opened yet.`,
        )
      }</p>
              <div class="button-row">
                <a class="button-secondary" href="${previewHref}">Open test launch</a>
              </div>`
      : `<p class="line-copy">Latest test launch <strong>${
        escapeHtml(
          input.latestPreviewSession.sessionId,
        )
      }</strong> ran as ${
        escapeHtml(
          input.latestPreviewSession.launch.userRole,
        )
      } in course <span class="inline-code">${
        escapeHtml(
          input.latestPreviewSession.launch.courseId,
        )
      }</span>.</p>
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
    ${
    records
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
      .join('')
  }
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
  const revision = formatRevisionContext(context);
  const parts = [
    ...(recipe === null ? [] : [recipe]),
    ...(revision === null ? [] : [revision]),
    references.length === 0 ? 'No references recorded.' : `References: ${references.join(', ')}`,
  ];

  return parts.join(' · ');
}

function formatRevisionContext(context: Record<string, unknown>): string | null {
  const revision = readUnknownRecord(context.revision);
  const sourceAppId = readUnknownString(revision?.sourceAppId);
  const sourceVersion = readUnknownString(revision?.sourceVersion);
  const targetVersion = readUnknownString(revision?.targetVersion);

  if (sourceAppId === null || sourceVersion === null || targetVersion === null) {
    return null;
  }

  return `Revision ${sourceAppId}@${sourceVersion} -> ${targetVersion}`;
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
