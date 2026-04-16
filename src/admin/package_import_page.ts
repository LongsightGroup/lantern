import {
  groupLocalAppDiagnostics,
  type LocalAppValidationDiagnostic,
} from '../authoring/local_app.ts';
import { type AdminNotice, escapeHtml, renderAdminLayout } from './layout.ts';

const PACKAGE_LAYOUT = `manifest.json
dist/index.html
content/activity.json
preview/fixtures.json
preview/tests.json`;

export function renderPackageImportPage(
  input: {
    notice?: AdminNotice | null;
    diagnostics?: LocalAppValidationDiagnostic[] | null;
  } = {},
): string {
  return renderAdminLayout({
    title: 'Lantern Package Import',
    eyebrow: 'Apps',
    heading: 'Import package',
    intro: 'Import one reviewed Lantern package directory into governed inventory.',
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: 'Import package',
      },
    ],
    notice: input.notice ?? null,
    body: `${renderPreflightDiagnostics(input.diagnostics ?? null)}<section class="panel">
      <div class="panel-body panel-header">
        <div class="stack">
          <p class="section-label">Reviewed package</p>
          <h2>Choose one package directory.</h2>
          <p>Lantern validates the manifest and referenced files, stores the reviewed snapshot, signs the reviewed runtime contract, and then adds the version to admin inventory.</p>
        </div>
        <div class="button-row">
          <a class="button-secondary" href="/admin/packages/reference">Open reference apps</a>
          <a class="button-ghost" href="/admin/packages">Back to apps</a>
        </div>
      </div>
    </section>
    <section class="two-column">
      <section class="panel">
        <div class="panel-body stack">
          <div class="stack">
            <p class="section-label">Upload</p>
            <h2>Send the exact reviewed artifact.</h2>
            <p>Use the package directory itself, not a zip file or a rewritten export. Lantern expects the package root to contain <span class="inline-code">${escapeHtml(
              'manifest.json',
            )}</span>.</p>
          </div>
          <form method="post" action="/admin/packages/import" enctype="multipart/form-data" class="form-stack">
            <div class="field">
              <label for="package-files">Package directory</label>
              <input id="package-files" type="file" name="packageFiles" webkitdirectory directory multiple required>
              <p class="field-hint">Choose the app folder so Lantern receives the reviewed file tree exactly once.</p>
            </div>
            <div class="button-row form-actions">
              <button class="button-primary" type="submit">Import package</button>
            </div>
          </form>
        </div>
      </section>
      <div class="stack">
        <section class="panel">
          <div class="panel-body stack">
            <p class="section-label">Canonical shape</p>
            <h2>Keep the package browser-first.</h2>
            <p>The reviewed package root should look like this baseline layout before you add optional scoring, grading, or evidence files.</p>
            <pre>${escapeHtml(PACKAGE_LAYOUT)}</pre>
          </div>
        </section>
        <section class="panel">
          <div class="panel-body stack">
            <p class="section-label">What happens next</p>
            <div class="step-list">
              <div class="step-card">
                <strong>1. Review contract</strong>
                <p class="deployment-form-note">Lantern checks the manifest, entrypoint, and referenced reviewed files.</p>
              </div>
              <div class="step-card">
                <strong>2. Immutable snapshot</strong>
                <p class="deployment-form-note">Lantern stores the reviewed snapshot under <span class="inline-code">${escapeHtml(
                  'var/packages/<app-id>/<version>/...',
                )}</span>.</p>
              </div>
              <div class="step-card">
                <strong>3. Admin inventory</strong>
                <p class="deployment-form-note">The package version lands in app inventory for approval, governed launch, and LMS setup.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>`,
  });
}

function renderPreflightDiagnostics(diagnostics: LocalAppValidationDiagnostic[] | null): string {
  if (!diagnostics || diagnostics.length === 0) {
    return '';
  }

  return `<section class="panel">
    <div class="panel-body stack">
      <div class="stack">
        <p class="section-label">Preflight</p>
        <h2>Fix these items before import.</h2>
        <p>Lantern blocked this upload before it wrote a reviewed snapshot. Resolve each reviewed package finding below, then re-upload the exact package directory.</p>
      </div>
      <div class="stack">
        ${groupLocalAppDiagnostics(diagnostics)
          .map(
            (group) =>
              `<section class="callout">
          <h3>${escapeHtml(group.label)}</h3>
          <ul>
            ${group.diagnostics
              .map(
                (diagnostic) =>
                  `<li>
              <strong>${escapeHtml(diagnostic.message)}</strong>
              <br>
              <span class="deployment-form-note">Fix: ${escapeHtml(diagnostic.fix)}</span>
            </li>`,
              )
              .join('')}
          </ul>
        </section>`,
          )
          .join('')}
      </div>
    </div>
  </section>`;
}
