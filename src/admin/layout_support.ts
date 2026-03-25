export interface AdminBreadcrumb {
  label: string;
  href?: string;
}

export interface AdminNotice {
  tone: 'error' | 'note' | 'success';
  title: string;
  detail: string;
  items?: string[];
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  active?: boolean;
}

const BRAND_MARK = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 3L8 10v10l8 9 8-9V10L16 3z" fill="url(#sb-g)" opacity="0.9"/><circle cx="16" cy="15" r="3.5" fill="white" opacity="0.85"/><defs><linearGradient id="sb-g" x1="8" y1="3" x2="24" y2="29"><stop stop-color="#f59e0b"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs></svg>`;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDateTime(value: string | null): string {
  if (value === null) {
    return 'Not recorded yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function defaultNav(activePath?: string): NavItem[] {
  return [
    {
      label: 'Packages',
      href: '/admin/packages',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
      active: activePath?.startsWith('/admin/packages') ?? false,
    },
  ];
}

export function renderSidebar(nav: NavItem[]): string {
  return `<aside class="sidebar">
      <a href="/" class="sidebar-brand">
        ${BRAND_MARK}
        Lantern
      </a>
      <nav class="sidebar-nav">
        <span class="sidebar-section-label">Manage</span>
        ${nav
          .map(
            (item) =>
              `<a class="sidebar-link ${item.active ? 'active' : ''}" href="${escapeHtml(item.href)}">${item.icon} ${escapeHtml(item.label)}</a>`,
          )
          .join('')}
      </nav>
      <div class="sidebar-footer">Control Pane</div>
    </aside>`;
}

export function renderPageHeader(input: {
  breadcrumbs: AdminBreadcrumb[];
  eyebrow: string;
  heading: string;
  intro: string;
}): string {
  return `<header class="page-header">
      ${
        input.breadcrumbs.length > 0
          ? `<ol class="breadcrumbs">${input.breadcrumbs
              .map((breadcrumb) =>
                breadcrumb.href
                  ? `<li><a href="${escapeHtml(breadcrumb.href)}">${escapeHtml(
                      breadcrumb.label,
                    )}</a></li>`
                  : `<li>${escapeHtml(breadcrumb.label)}</li>`,
              )
              .join('')}</ol>`
          : ''
      }
      <p class="page-eyebrow">${escapeHtml(input.eyebrow)}</p>
      <h1 class="page-title">${escapeHtml(input.heading)}</h1>
      <p class="page-desc">${escapeHtml(input.intro)}</p>
    </header>`;
}

export function renderNotice(notice: AdminNotice): string {
  const items = notice.items ?? [];

  return `<section class="flash flash-${escapeHtml(notice.tone)}" aria-live="polite">
    <h2>${escapeHtml(notice.title)}</h2>
    <p>${escapeHtml(notice.detail)}</p>
    ${
      items.length > 0
        ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : ''
    }
  </section>`;
}
