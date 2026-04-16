import { type AdminNotice, renderAdminLayout } from './layout.ts';
import { renderReferencePackageCatalog } from './package_reference_support.ts';

export function renderReferencePackagePage(
  input: {
    notice?: AdminNotice | null;
  } = {},
): string {
  return renderAdminLayout({
    title: 'Lantern Reference Apps',
    eyebrow: 'Reference apps',
    heading: 'Reference apps',
    intro:
      'Import one shipped app when you want a clean sample after the main package import path.',
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: 'Reference apps',
      },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body panel-header">
        <div class="stack">
          <p class="section-label">Shipped examples</p>
          <h2>Start from a known app.</h2>
          <p>Use this page when you want Lantern's curated examples. The primary operator path is still importing your own reviewed package directory.</p>
        </div>
        <div class="button-row">
          <a class="button-secondary" href="/admin/packages/import">Import package</a>
          <a class="button-secondary" href="/admin/packages">Back to apps</a>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body card-grid">
        ${renderReferencePackageCatalog('button-primary')}
      </div>
    </section>`,
  });
}
