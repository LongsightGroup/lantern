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

const BRAND_MARK = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 3L8 10v10l8 9 8-9V10L16 3z" fill="url(#sb-g)" opacity="0.9"/><circle cx="16" cy="15" r="3.5" fill="white" opacity="0.85"/><defs><linearGradient id="sb-g" x1="8" y1="3" x2="24" y2="29"><stop stop-color="#f59e0b"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs></svg>`;

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  active?: boolean;
}

function defaultNav(activePath?: string): NavItem[] {
  return [
    {
      label: "Packages",
      href: "/admin/packages",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
      active: activePath?.startsWith("/admin/packages") ?? false,
    },
  ];
}

export function renderAdminLayout(input: {
  title: string;
  eyebrow: string;
  heading: string;
  intro: string;
  body: string;
  breadcrumbs?: AdminBreadcrumb[];
  notice?: AdminNotice | null;
  activePath?: string;
}): string {
  const breadcrumbs = input.breadcrumbs ?? [];
  const nav = defaultNav(input.activePath ?? "/admin/packages");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --bg: #f7f8fa;
        --surface: #ffffff;
        --ink: #0a2540;
        --secondary: #425466;
        --muted: #6b7c93;
        --faint: #8898a9;
        --line: #e3e8ee;
        --line-light: #f0f3f7;
        --accent: #4f46e5;
        --accent-hover: #4338ca;
        --accent-soft: #eef2ff;
        --accent-muted: #a5b4fc;
        --brand-warm: #f59e0b;
        --success: #0ea371;
        --success-soft: #eaf9f4;
        --warning: #d97706;
        --warning-soft: #fef9ec;
        --danger: #df1b41;
        --danger-soft: #fdf0f3;
        --sidebar-width: 240px;
        --radius: 8px;
        --radius-sm: 6px;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        height: 100%;
      }

      body {
        color: var(--ink);
        font: 14px/1.55 var(--font);
        background: var(--bg);
        -webkit-font-smoothing: antialiased;
      }

      a {
        color: inherit;
      }

      /* ─── Sidebar ─── */

      .app {
        display: flex;
        min-height: 100vh;
      }

      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: var(--sidebar-width);
        display: flex;
        flex-direction: column;
        padding: 0;
        background: var(--ink);
        color: rgba(255, 255, 255, 0.7);
        z-index: 10;
        overflow-y: auto;
      }

      .sidebar-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 20px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #fff;
        text-decoration: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .sidebar-brand svg {
        flex-shrink: 0;
      }

      .sidebar-nav {
        padding: 12px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }

      .sidebar-section-label {
        padding: 10px 10px 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.35);
      }

      .sidebar-link {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--radius-sm);
        font-size: 13.5px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
        text-decoration: none;
        transition: background 120ms, color 120ms;
      }

      .sidebar-link:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }

      .sidebar-link.active {
        background: rgba(255, 255, 255, 0.10);
        color: #fff;
      }

      .sidebar-link svg {
        opacity: 0.5;
        flex-shrink: 0;
      }

      .sidebar-link.active svg {
        opacity: 0.9;
      }

      .sidebar-footer {
        padding: 14px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.25);
      }

      /* ─── Main content ─── */

      .main {
        margin-left: var(--sidebar-width);
        flex: 1;
        min-height: 100vh;
      }

      .page-header {
        padding: 28px 40px 24px;
        background: var(--surface);
        border-bottom: 1px solid var(--line);
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0;
        margin: 0 0 10px;
        list-style: none;
        color: var(--muted);
        font-size: 13px;
      }

      .breadcrumbs li + li::before {
        content: "/";
        margin-right: 6px;
        color: var(--line);
      }

      .breadcrumbs a {
        text-decoration: none;
        color: var(--muted);
      }

      .breadcrumbs a:hover {
        color: var(--ink);
      }

      .page-eyebrow {
        margin: 0 0 4px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .page-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.25;
        color: var(--ink);
      }

      .page-desc {
        margin: 6px 0 0;
        max-width: 600px;
        font-size: 14px;
        color: var(--secondary);
        line-height: 1.55;
      }

      .page-body {
        padding: 28px 40px 60px;
      }

      .content {
        display: grid;
        gap: 24px;
      }

      /* ─── Panels ─── */

      .panel {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
      }

      .panel-body {
        padding: 24px;
      }

      .section-label {
        margin: 0 0 12px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      /* ─── Flash notices ─── */

      .flash {
        padding: 14px 18px;
        border-radius: var(--radius);
        border: 1px solid transparent;
        font-size: 13.5px;
      }

      .flash h2 {
        margin: 0 0 2px;
        font-size: 14px;
        font-weight: 600;
      }

      .flash p,
      .flash ul {
        margin: 0;
      }

      .flash ul {
        margin-top: 8px;
        padding-left: 18px;
      }

      .flash-success {
        background: var(--success-soft);
        border-color: #c6f0df;
        color: #0c6b4b;
      }

      .flash-note {
        background: var(--accent-soft);
        border-color: #c7d2fe;
        color: #3730a3;
      }

      .flash-error {
        background: var(--danger-soft);
        border-color: #f9c4cf;
        color: #9b1133;
      }

      /* ─── Grid helpers ─── */

      .grid {
        display: grid;
        gap: 20px;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      /* Facts grid (bordered cells via gap trick) */
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--line);
        overflow: hidden;
      }

      .fact {
        padding: 14px 16px;
        background: var(--surface);
      }

      /* Standalone fact (outside a .facts grid, e.g. in an aside) */
      .stack > .fact {
        border: 1px solid var(--line);
        border-radius: var(--radius);
      }

      .fact-label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .fact-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--ink);
      }

      /* ─── Status badges ─── */

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px 3px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .status-badge::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
      }

      .status-approved {
        background: var(--success-soft);
        color: var(--success);
      }

      .status-pending {
        background: var(--warning-soft);
        color: var(--warning);
      }

      .status-rejected {
        background: var(--danger-soft);
        color: var(--danger);
      }

      /* ─── Buttons ─── */

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .button,
      button,
      select,
      textarea {
        font: inherit;
      }

      .button,
      button {
        appearance: none;
        border: none;
        cursor: pointer;
        text-decoration: none;
      }

      .button,
      .button-secondary,
      .button-danger,
      .button-ghost,
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 36px;
        padding: 0 16px;
        border-radius: var(--radius-sm);
        font-size: 13.5px;
        font-weight: 600;
        transition: background 120ms, box-shadow 120ms;
      }

      .button,
      button.button-primary {
        background: var(--accent);
        color: white;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.10), 0 0 0 1px rgba(79, 70, 229, 0.15);
      }

      .button:hover,
      button.button-primary:hover {
        background: var(--accent-hover);
      }

      .button-secondary {
        background: var(--surface);
        color: var(--ink);
        border: 1px solid var(--line);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .button-secondary:hover {
        background: var(--bg);
      }

      .button-danger {
        background: var(--danger);
        color: white;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.10);
      }

      .button-danger:hover {
        background: #c5183a;
      }

      .button-ghost {
        background: transparent;
        color: var(--secondary);
        border: 1px solid var(--line);
      }

      .button-ghost:hover {
        background: var(--bg);
        color: var(--ink);
      }

      /* ─── Line list ─── */

      .line-list {
        display: grid;
        gap: 0;
      }

      .line-item {
        display: grid;
        gap: 4px;
        padding: 14px 0;
        border-top: 1px solid var(--line-light);
      }

      .line-item:first-child {
        padding-top: 0;
        border-top: none;
      }

      .line-title {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        font-weight: 600;
        font-size: 14px;
      }

      .line-copy {
        margin: 0;
        color: var(--secondary);
        font-size: 13.5px;
      }

      /* ─── Table rows ─── */

      .table-list {
        display: grid;
        gap: 0;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
      }

      .table-row {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        background: var(--surface);
        border-bottom: 1px solid var(--line-light);
      }

      .table-row:last-child {
        border-bottom: none;
      }

      .table-row-top {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .table-row p {
        margin: 0;
      }

      .table-row-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        color: var(--muted);
        font-size: 13px;
      }

      .table-row-meta strong {
        font-weight: 500;
        color: var(--secondary);
      }

      /* ─── Chips ─── */

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: var(--radius-sm);
        background: var(--bg);
        border: 1px solid var(--line);
        font-size: 13px;
        color: var(--secondary);
      }

      .chip-flagged {
        background: var(--warning-soft);
        border-color: #fde6a8;
        color: #92400e;
      }

      /* ─── Callout ─── */

      .callout {
        padding: 14px 18px;
        border-radius: var(--radius);
        background: var(--warning-soft);
        border: 1px solid #fde6a8;
        font-size: 13.5px;
      }

      .callout h2,
      .callout h3 {
        margin: 0 0 4px;
        font-size: 13.5px;
        font-weight: 600;
        color: #92400e;
      }

      .callout p {
        margin: 0;
        color: #78350f;
      }

      .callout ul {
        margin: 8px 0 0;
        padding-left: 18px;
        color: #78350f;
      }

      /* ─── Two-column ─── */

      .two-column {
        display: grid;
        gap: 24px;
        grid-template-columns: 1fr minmax(240px, 320px);
      }

      /* ─── Forms ─── */

      .field {
        display: grid;
        gap: 6px;
      }

      .field label {
        font-size: 13px;
        font-weight: 600;
        color: var(--secondary);
      }

      textarea,
      select {
        width: 100%;
        border-radius: var(--radius-sm);
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--ink);
        padding: 10px 12px;
        font-size: 14px;
        transition: border-color 120ms, box-shadow 120ms;
      }

      textarea:focus,
      select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }

      textarea {
        min-height: 100px;
        resize: vertical;
      }

      /* ─── Details / code ─── */

      details {
        border-radius: var(--radius);
        border: 1px solid var(--line);
        background: var(--surface);
        overflow: hidden;
      }

      summary {
        padding: 12px 16px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13.5px;
        color: var(--secondary);
      }

      summary:hover {
        background: var(--bg);
      }

      pre {
        margin: 0;
        padding: 0 16px 16px;
        overflow-x: auto;
        font: 12.5px/1.6 "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
        color: var(--secondary);
      }

      /* ─── Empty state ─── */

      .empty-state {
        display: grid;
        gap: 16px;
      }

      .empty-state h2,
      .panel h2,
      .panel h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .empty-state p,
      .panel > p,
      .panel-body > .stack > p:not(.section-label):not(.line-title) {
        margin: 0;
        color: var(--secondary);
        font-size: 14px;
      }

      /* ─── Misc ─── */

      .micro {
        font-size: 13px;
      }

      .muted {
        color: var(--muted);
      }

      /* ─── Responsive ─── */

      @media (max-width: 860px) {
        .two-column {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .sidebar {
          display: none;
        }

        .main {
          margin-left: 0;
        }

        .page-header,
        .page-body {
          padding-left: 20px;
          padding-right: 20px;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <a href="/" class="sidebar-brand">
          ${BRAND_MARK}
          Lantern
        </a>
        <nav class="sidebar-nav">
          <span class="sidebar-section-label">Manage</span>
          ${nav.map((item) => `<a class="sidebar-link ${item.active ? "active" : ""}" href="${escapeHtml(item.href)}">${item.icon} ${escapeHtml(item.label)}</a>`).join("")}
        </nav>
        <div class="sidebar-footer">Control Pane</div>
      </aside>
      <div class="main">
        <header class="page-header">
          ${
    breadcrumbs.length > 0
      ? `<ol class="breadcrumbs">${
        breadcrumbs.map((breadcrumb) =>
          breadcrumb.href
            ? `<li><a href="${escapeHtml(breadcrumb.href)}">${
              escapeHtml(breadcrumb.label)
            }</a></li>`
            : `<li>${escapeHtml(breadcrumb.label)}</li>`
        ).join("")
      }</ol>`
      : ""
  }
          <p class="page-eyebrow">${escapeHtml(input.eyebrow)}</p>
          <h1 class="page-title">${escapeHtml(input.heading)}</h1>
          <p class="page-desc">${escapeHtml(input.intro)}</p>
        </header>
        <main class="page-body">
          <div class="content">
            ${input.notice ? renderNotice(input.notice) : ""}
            ${input.body}
          </div>
        </main>
      </div>
    </div>
  </body>
</html>`;
}

function renderNotice(notice: AdminNotice): string {
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
