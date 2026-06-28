import type { PackageVersionRecord } from '../package_review/types.ts';
import { type AdminNotice, escapeHtml, renderAdminLayout } from './layout.ts';
import { renderPackagePageNav } from './package_navigation.ts';

export function renderAppRevisionPage(input: {
  packageVersion: PackageVersionRecord;
  history: PackageVersionRecord[];
  targetVersion: string;
  promptText?: string;
  notice?: AdminNotice | null;
}): string {
  const generatedPrompt = buildRevisionAuthoringPrompt({
    packageVersion: input.packageVersion,
    targetVersion: input.targetVersion,
  });
  const promptText = input.promptText ?? generatedPrompt;

  return renderAdminLayout({
    title: `Revise ${input.packageVersion.title}`,
    eyebrow: 'App writer revision',
    heading: `Revise ${input.packageVersion.title}`,
    intro:
      'Start from this immutable package snapshot, ask Lantern for changes, and save the result as a new pending version.',
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: input.packageVersion.title,
        href: `/admin/packages/${escapeHtml(input.packageVersion.appId)}`,
      },
      {
        label: input.packageVersion.version,
        href: `/admin/packages/${escapeHtml(input.packageVersion.appId)}/versions/${
          escapeHtml(
            input.packageVersion.version,
          )
        }`,
      },
      { label: 'Revise' },
    ],
    notice: input.notice ?? null,
    pageNav: renderPackagePageNav({
      appId: input.packageVersion.appId,
      history: input.history,
      currentSection: 'version',
      currentVersion: input.packageVersion,
    }),
    body: `<section class="panel">
      <div class="panel-body stack">
        <div class="stack">
          <p class="section-label">Revision request</p>
          <h2>Create a new version</h2>
          <p class="line-copy">Lantern will initialize the app writer workspace from ${
      escapeHtml(
        input.packageVersion.appId,
      )
    }@${
      escapeHtml(
        input.packageVersion.version,
      )
    }, run the same harness validation loop, and save a new pending package.</p>
        </div>
        <section class="line-item">
          <div class="table-row-top">
            <p class="line-title">Copyable authoring prompt</p>
            <button class="button-secondary" type="button" data-copy-authoring-prompt>Copy prompt</button>
          </div>
          <label class="field" for="copyable-authoring-prompt">
            <span class="micro muted">Exact app plan and capability contract</span>
            <textarea id="copyable-authoring-prompt" rows="12" readonly data-authoring-prompt>${
      escapeHtml(
        generatedPrompt,
      )
    }</textarea>
          </label>
          <p class="micro muted" aria-live="polite" data-copy-authoring-status></p>
        </section>
        <form class="stack app-writer-form" method="post" action="/admin/packages/${
      escapeHtml(
        input.packageVersion.appId,
      )
    }/versions/${escapeHtml(input.packageVersion.version)}/revise" data-app-writer-form>
          <label class="field">
            <span>Refinement prompt</span>
            <textarea name="promptText" rows="8" required>${
      escapeHtml(
        promptText,
      )
    }</textarea>
          </label>
          <label class="field">
            <span>New version</span>
            <input name="targetVersion" value="${escapeHtml(input.targetVersion)}" required>
          </label>
          <div class="button-row">
            <button class="button-primary app-writer-submit-button" type="submit" data-app-writer-submit>
              <span class="app-writer-submit-label">Revise app</span>
              <span class="app-writer-submit-busy-label">Revising app</span>
            </button>
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        input.packageVersion.appId,
      )
    }/versions/${escapeHtml(input.packageVersion.version)}">Back to version</a>
          </div>
          <p
            id="app-writer-submit-status"
            class="app-writer-submit-status"
            aria-live="polite"
            data-app-writer-submit-status
            hidden
          >Revising app. Lantern is loading the previous package snapshot, calling the model, validating the package, and running preview checks.</p>
        </form>
      </div>
    </section>
    <script>
      (() => {
        const form = document.querySelector('[data-app-writer-form]');
        const submit = document.querySelector('[data-app-writer-submit]');
        const status = document.querySelector('[data-app-writer-submit-status]');
        const copyButton = document.querySelector('[data-copy-authoring-prompt]');
        const copySource = document.querySelector('[data-authoring-prompt]');
        const copyStatus = document.querySelector('[data-copy-authoring-status]');

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

        if (copyButton instanceof HTMLButtonElement && copySource instanceof HTMLTextAreaElement && copyStatus instanceof HTMLElement) {
          copyButton.addEventListener('click', async () => {
            copySource.select();
            copySource.setSelectionRange(0, copySource.value.length);

            try {
              await navigator.clipboard.writeText(copySource.value);
              copyStatus.textContent = 'Prompt copied.';
            } catch {
              copyStatus.textContent = 'Prompt selected.';
            }
          });
        }
      })();
    </script>`,
  });
}

export function buildRevisionAuthoringPrompt(input: {
  packageVersion: PackageVersionRecord;
  targetVersion: string;
}): string {
  const packageVersion = input.packageVersion;
  const appPlan = {
    appId: packageVersion.appId,
    sourceVersion: packageVersion.version,
    targetVersion: input.targetVersion,
    title: packageVersion.title,
    description: packageVersion.description,
    entrypoint: packageVersion.entrypoint,
    roles: packageVersion.roles,
    installScope: packageVersion.installScope,
    grading: packageVersion.grading,
    capabilities: packageVersion.capabilities,
    manifest: packageVersion.manifestJson,
    runtimeContract: packageVersion.runtimeContract,
  };

  return [
    `Revise the reviewed Lantern learning app "${packageVersion.title}".`,
    '',
    'Use this exact app plan and reviewed runtime capability contract. Keep the app inside Lantern: no LMS tokens, no direct database access, no arbitrary outbound HTTP, and no direct grade writes.',
    '',
    'Do not add or remove runtime capabilities unless the requested change explicitly requires a reviewable capability change.',
    '',
    '```json',
    JSON.stringify(appPlan, null, 2),
    '```',
    '',
    'Requested change:',
    '- ',
  ].join('\n');
}
