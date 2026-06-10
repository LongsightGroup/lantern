import type { AppGenerationPlanningResult } from '../app_writer/types.ts';
import { type AdminNotice, escapeHtml, renderAdminLayout } from './layout.ts';
import type { AppWriterSelectedContext } from '../app_writer/context.ts';
import { formatProgressStage, formatSelectedContext } from './app_writer_run_view_model.ts';

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
  selectedContext: AppWriterSelectedContext;
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
