export interface AdminBreadcrumb {
  label: string;
  href?: string;
}

export interface AdminNotice {
  tone: "error" | "note" | "success";
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

interface AdminIdentity {
  displayName: string;
  detail: string;
}

const BRAND_MARK =
  `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 3L8 10v10l8 9 8-9V10L16 3z" fill="url(#sb-g)" opacity="0.9"/><circle cx="16" cy="15" r="3.5" fill="white" opacity="0.85"/><defs><linearGradient id="sb-g" x1="8" y1="3" x2="24" y2="29"><stop stop-color="#f59e0b"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs></svg>`;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDateTime(value: string | null): string {
  if (value === null) {
    return "Not recorded yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function defaultNav(activePath?: string): NavItem[] {
  return [
    {
      label: "Packages",
      href: "/admin/packages",
      icon:
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
      active: activePath?.startsWith("/admin/packages") ?? false,
    },
    {
      label: "Deployments",
      href: "/admin/deployments",
      icon:
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><line x1="7" y1="7" x2="7.01" y2="7"/><line x1="7" y1="17" x2="7.01" y2="17"/><line x1="11" y1="7" x2="17" y2="7"/><line x1="11" y1="17" x2="17" y2="17"/></svg>`,
      active: activePath?.startsWith("/admin/deployments") ?? false,
    },
    {
      label: "Verification",
      href: "/admin/verification",
      icon:
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
      active: activePath?.startsWith("/admin/verification") ?? false,
    },
    {
      label: "Placements",
      href: "/admin/placements",
      icon:
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10z"/><circle cx="12" cy="11" r="2.5"/></svg>`,
      active: activePath?.startsWith("/admin/placements") ?? false,
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
        ${
    nav
      .map(
        (item) =>
          `<a class="sidebar-link ${item.active ? "active" : ""}" href="${
            escapeHtml(item.href)
          }">${item.icon} ${escapeHtml(item.label)}</a>`,
      )
      .join("")
  }
      </nav>
      <div class="sidebar-footer">Governed admin</div>
    </aside>`;
}

export function renderPageHeader(input: {
  breadcrumbs: AdminBreadcrumb[];
  eyebrow: string;
  heading: string;
  intro: string;
}): string {
  const identity = resolveAdminIdentity();

  return `<header class="page-header">
      <div class="page-header-bar">
        <div class="page-header-copy">
      ${
    input.breadcrumbs.length > 0
      ? `<ol class="breadcrumbs">${
        input.breadcrumbs
          .map((breadcrumb) =>
            breadcrumb.href
              ? `<li><a href="${escapeHtml(breadcrumb.href)}">${
                escapeHtml(
                  breadcrumb.label,
                )
              }</a></li>`
              : `<li>${escapeHtml(breadcrumb.label)}</li>`
          )
          .join("")
      }</ol>`
      : ""
  }
      <p class="page-eyebrow">${escapeHtml(input.eyebrow)}</p>
      <h1 class="page-title">${escapeHtml(input.heading)}</h1>
      <p class="page-desc">${escapeHtml(input.intro)}</p>
        </div>
        <aside class="operator-chip" aria-label="Current operator">
          <span class="operator-chip-label">${
    escapeHtml(identity.detail)
  }</span>
          <strong class="operator-chip-name">${
    escapeHtml(identity.displayName)
  }</strong>
        </aside>
      </div>
    </header>`;
}

export function renderNotice(notice: AdminNotice): string {
  const items = notice.items ?? [];

  return `<section class="flash flash-${
    escapeHtml(notice.tone)
  }" aria-live="polite">
    <h2>${escapeHtml(notice.title)}</h2>
    <p>${escapeHtml(notice.detail)}</p>
    ${
    items.length > 0
      ? `<ul>${
        items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      }</ul>`
      : ""
  }
  </section>`;
}

function resolveAdminIdentity(): AdminIdentity {
  const displayName =
    normalizeIdentityValue(Deno.env.get("LANTERN_OPERATOR_NAME")) ??
      normalizeIdentityValue(Deno.env.get("USER")) ??
      normalizeIdentityValue(Deno.env.get("LOGNAME")) ??
      "Local operator";

  return {
    displayName,
    detail: "Signed in",
  };
}

function normalizeIdentityValue(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}
