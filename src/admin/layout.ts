import { ADMIN_LAYOUT_STYLES } from './layout_styles.ts';
import {
  type AdminBreadcrumb,
  type AdminNotice,
  defaultNav,
  escapeHtml,
  renderNotice,
  renderPageHeader,
  renderSidebar,
} from './layout_support.ts';

export type { AdminBreadcrumb, AdminNotice, NavChildItem, NavItem } from './layout_support.ts';
export { escapeHtml, formatDateTime } from './layout_support.ts';

export function renderAdminLayout(input: {
  title: string;
  eyebrow: string;
  heading: string;
  intro: string;
  body: string;
  pageNav?: string;
  breadcrumbs?: AdminBreadcrumb[];
  notice?: AdminNotice | null;
  activePath?: string;
}): string {
  const breadcrumbs = input.breadcrumbs ?? [];
  const nav = defaultNav(input.activePath ?? '/admin/packages');

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>${ADMIN_LAYOUT_STYLES}
    </style>
  </head>
  <body>
    <div class="app">
      ${renderSidebar(nav)}
      <div class="main">
        ${renderPageHeader({
          breadcrumbs,
          eyebrow: input.eyebrow,
          heading: input.heading,
          intro: input.intro,
          pageNav: input.pageNav ?? null,
        })}
        <main class="page-body">
          <div class="content">
            ${input.notice ? renderNotice(input.notice) : ''}
            ${input.body}
          </div>
        </main>
      </div>
    </div>
  </body>
</html>`;
}
