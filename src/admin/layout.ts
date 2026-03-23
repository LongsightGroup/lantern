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

export function renderAdminLayout(input: {
  title: string;
  eyebrow: string;
  heading: string;
  intro: string;
  body: string;
  breadcrumbs?: AdminBreadcrumb[];
  notice?: AdminNotice | null;
}): string {
  const breadcrumbs = input.breadcrumbs ?? [];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,600;700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        --bg: oklch(0.965 0.012 95);
        --bg-strong: oklch(0.923 0.024 92);
        --surface: color-mix(in oklab, oklch(0.99 0.01 90) 88%, oklch(0.88 0.03 226));
        --surface-strong: color-mix(in oklab, oklch(0.94 0.018 90) 80%, oklch(0.78 0.03 224));
        --ink: oklch(0.285 0.034 242);
        --muted: oklch(0.5 0.028 230);
        --line: oklch(0.82 0.02 218);
        --accent: oklch(0.49 0.11 240);
        --accent-soft: oklch(0.9 0.03 240);
        --success: oklch(0.58 0.11 155);
        --success-soft: oklch(0.92 0.04 155);
        --warning: oklch(0.73 0.11 82);
        --warning-soft: oklch(0.95 0.04 82);
        --danger: oklch(0.59 0.11 28);
        --danger-soft: oklch(0.94 0.04 28);
        --shadow: 0 30px 80px color-mix(in oklab, var(--ink) 12%, transparent);
        --radius-lg: 28px;
        --radius-md: 18px;
        --radius-sm: 12px;
      }

      * {
        box-sizing: border-box;
      }

      html {
        background:
          radial-gradient(circle at top left, color-mix(in oklab, var(--accent) 12%, transparent), transparent 40%),
          linear-gradient(180deg, var(--bg), var(--bg-strong));
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font: 16px/1.55 "Public Sans", "Segoe UI", sans-serif;
        background:
          linear-gradient(90deg, color-mix(in oklab, var(--accent) 6%, transparent) 0 1px, transparent 1px 100%),
          linear-gradient(180deg, color-mix(in oklab, var(--accent) 4%, transparent) 0 1px, transparent 1px 100%),
          linear-gradient(180deg, transparent, color-mix(in oklab, var(--accent) 2%, transparent)),
          linear-gradient(180deg, var(--bg), var(--bg-strong));
        background-size: 72px 72px, 72px 72px, auto, auto;
      }

      a {
        color: inherit;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 60px;
      }

      .masthead {
        display: grid;
        gap: 18px;
        padding: clamp(26px, 5vw, 42px);
        border: 1px solid color-mix(in oklab, var(--line) 92%, var(--accent) 8%);
        border-radius: var(--radius-lg);
        background:
          linear-gradient(135deg, color-mix(in oklab, var(--surface) 88%, white), color-mix(in oklab, var(--surface-strong) 40%, white)),
          var(--surface);
        box-shadow: var(--shadow);
      }

      .topline {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 16px;
        align-items: start;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--accent) 70%, var(--ink));
      }

      .brand::before {
        content: "";
        width: 14px;
        height: 14px;
        border-radius: 4px;
        background:
          linear-gradient(135deg, color-mix(in oklab, var(--warning) 72%, white), color-mix(in oklab, var(--accent) 65%, white));
        box-shadow: 0 0 0 5px color-mix(in oklab, var(--accent) 10%, transparent);
      }

      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .nav a {
        padding: 8px 12px;
        border-radius: 999px;
        color: color-mix(in oklab, var(--muted) 92%, var(--ink) 8%);
        text-decoration: none;
      }

      .nav a:hover,
      .nav a:focus-visible {
        background: color-mix(in oklab, var(--accent) 10%, white);
        color: var(--ink);
        outline: none;
      }

      .eyebrow {
        margin: 0;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--muted) 86%, var(--ink) 14%);
      }

      h1 {
        margin: 0;
        max-width: 14ch;
        font: 700 clamp(2.45rem, 5vw, 4.8rem) / 0.96 "Newsreader", serif;
        letter-spacing: -0.035em;
      }

      .lede {
        margin: 0;
        max-width: 68ch;
        color: var(--muted);
        font-size: clamp(1rem, 1.2vw, 1.08rem);
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 0;
        margin: 0;
        list-style: none;
        color: color-mix(in oklab, var(--muted) 90%, var(--ink) 10%);
        font-size: 0.92rem;
      }

      .breadcrumbs li + li::before {
        content: "/";
        margin-right: 10px;
        color: color-mix(in oklab, var(--muted) 75%, transparent);
      }

      .breadcrumbs a {
        text-decoration: none;
      }

      .breadcrumbs a:hover,
      .breadcrumbs a:focus-visible {
        text-decoration: underline;
      }

      .content {
        margin-top: 22px;
        display: grid;
        gap: 22px;
      }

      .panel {
        border: 1px solid color-mix(in oklab, var(--line) 94%, var(--accent) 6%);
        border-radius: var(--radius-lg);
        background: color-mix(in oklab, var(--surface) 92%, white);
        box-shadow: 0 18px 48px color-mix(in oklab, var(--ink) 7%, transparent);
      }

      .panel-body {
        padding: clamp(22px, 3vw, 34px);
      }

      .section-label {
        margin: 0 0 10px;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--muted) 86%, var(--ink) 14%);
      }

      .flash {
        padding: 18px 20px;
        border-radius: var(--radius-md);
        border: 1px solid transparent;
      }

      .flash h2 {
        margin: 0 0 4px;
        font-size: 1rem;
      }

      .flash p,
      .flash ul {
        margin: 0;
        color: var(--ink);
      }

      .flash ul {
        margin-top: 10px;
        padding-left: 18px;
      }

      .flash-success {
        background: var(--success-soft);
        border-color: color-mix(in oklab, var(--success) 26%, white);
      }

      .flash-note {
        background: color-mix(in oklab, var(--accent) 10%, white);
        border-color: color-mix(in oklab, var(--accent) 24%, white);
      }

      .flash-error {
        background: var(--danger-soft);
        border-color: color-mix(in oklab, var(--danger) 24%, white);
      }

      .grid {
        display: grid;
        gap: 20px;
      }

      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 14px;
      }

      .fact {
        padding: 16px 18px;
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--surface-strong) 35%, white);
        border: 1px solid color-mix(in oklab, var(--line) 88%, var(--accent) 12%);
      }

      .fact-label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--muted) 86%, var(--ink) 14%);
      }

      .fact-value {
        font-size: 1rem;
        font-weight: 600;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 0.83rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .status-badge::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: currentColor;
      }

      .status-approved {
        background: var(--success-soft);
        color: color-mix(in oklab, var(--success) 78%, var(--ink) 22%);
      }

      .status-pending {
        background: var(--warning-soft);
        color: color-mix(in oklab, var(--warning) 74%, var(--ink) 26%);
      }

      .status-rejected {
        background: var(--danger-soft);
        color: color-mix(in oklab, var(--danger) 78%, var(--ink) 22%);
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
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
        gap: 10px;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 999px;
        font-weight: 700;
      }

      .button,
      button.button-primary {
        background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 84%, white), color-mix(in oklab, var(--accent) 64%, var(--ink)));
        color: white;
      }

      .button-secondary {
        background: color-mix(in oklab, var(--surface-strong) 36%, white);
        color: var(--ink);
        border: 1px solid color-mix(in oklab, var(--line) 85%, var(--accent) 15%);
      }

      .button-danger {
        background: linear-gradient(135deg, color-mix(in oklab, var(--danger) 88%, white), color-mix(in oklab, var(--danger) 62%, var(--ink)));
        color: white;
      }

      .button-ghost {
        background: transparent;
        color: color-mix(in oklab, var(--muted) 82%, var(--ink) 18%);
        border: 1px solid color-mix(in oklab, var(--line) 85%, var(--accent) 15%);
      }

      .button:hover,
      .button-secondary:hover,
      .button-danger:hover,
      .button-ghost:hover,
      button:hover,
      .button:focus-visible,
      .button-secondary:focus-visible,
      .button-danger:focus-visible,
      .button-ghost:focus-visible,
      button:focus-visible {
        transform: translateY(-1px);
        outline: none;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .line-list {
        display: grid;
        gap: 12px;
      }

      .line-item {
        display: grid;
        gap: 6px;
        padding: 14px 0;
        border-top: 1px solid color-mix(in oklab, var(--line) 88%, transparent);
      }

      .line-item:first-child {
        padding-top: 0;
        border-top: none;
      }

      .line-title {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        font-weight: 700;
      }

      .line-copy {
        margin: 0;
        color: var(--muted);
      }

      .table-list {
        display: grid;
        gap: 12px;
      }

      .table-row {
        display: grid;
        gap: 14px;
        padding: 18px;
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--surface-strong) 32%, white);
        border: 1px solid color-mix(in oklab, var(--line) 88%, var(--accent) 12%);
      }

      .table-row-top {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 14px;
      }

      .table-row p {
        margin: 0;
      }

      .table-row-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 18px;
        color: var(--muted);
        font-size: 0.94rem;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--surface-strong) 36%, white);
        border: 1px solid color-mix(in oklab, var(--line) 90%, var(--accent) 10%);
        font-size: 0.92rem;
        color: var(--ink);
      }

      .chip-flagged {
        background: color-mix(in oklab, var(--warning-soft) 90%, white);
        border-color: color-mix(in oklab, var(--warning) 25%, white);
      }

      .callout {
        padding: 18px 20px;
        border-radius: var(--radius-md);
        background: color-mix(in oklab, var(--warning-soft) 86%, white);
        border: 1px solid color-mix(in oklab, var(--warning) 24%, white);
      }

      .callout h2,
      .callout h3 {
        margin: 0 0 6px;
        font-size: 1rem;
      }

      .callout p {
        margin: 0;
        color: var(--ink);
      }

      .callout ul {
        margin: 10px 0 0;
        padding-left: 18px;
      }

      .two-column {
        display: grid;
        gap: 22px;
        grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.9fr);
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        font-size: 0.88rem;
        font-weight: 700;
        color: color-mix(in oklab, var(--muted) 85%, var(--ink) 15%);
      }

      textarea,
      select {
        width: 100%;
        border-radius: 16px;
        border: 1px solid color-mix(in oklab, var(--line) 85%, var(--accent) 15%);
        background: white;
        color: var(--ink);
        padding: 14px 16px;
      }

      textarea {
        min-height: 132px;
        resize: vertical;
      }

      details {
        border-radius: var(--radius-md);
        border: 1px solid color-mix(in oklab, var(--line) 88%, var(--accent) 12%);
        background: color-mix(in oklab, var(--surface-strong) 22%, white);
        overflow: hidden;
      }

      summary {
        padding: 16px 18px;
        cursor: pointer;
        font-weight: 700;
      }

      pre {
        margin: 0;
        padding: 0 18px 18px;
        overflow-x: auto;
        font: 0.88rem/1.6 "SFMono-Regular", "Menlo", monospace;
        color: color-mix(in oklab, var(--ink) 92%, black);
      }

      .empty-state {
        display: grid;
        gap: 18px;
      }

      .empty-state h2,
      .panel h2,
      .panel h3 {
        margin: 0;
        font-size: 1.3rem;
      }

      .empty-state p,
      .panel p {
        margin: 0;
        color: var(--muted);
      }

      .micro {
        font-size: 0.92rem;
      }

      .muted {
        color: var(--muted);
      }

      @media (max-width: 860px) {
        .two-column {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .shell {
          width: min(100vw - 20px, 100%);
          padding-top: 16px;
        }

        .masthead,
        .panel-body {
          padding: 20px;
        }

        h1 {
          max-width: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="masthead">
        <div class="topline">
          <div class="brand">Lantern Control Pane</div>
          <nav class="nav" aria-label="Primary">
            <a href="/">Home</a>
            <a href="/admin/packages">Packages</a>
          </nav>
        </div>
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
        <div class="grid">
          <p class="eyebrow">${escapeHtml(input.eyebrow)}</p>
          <h1>${escapeHtml(input.heading)}</h1>
          <p class="lede">${escapeHtml(input.intro)}</p>
        </div>
      </header>
      <main class="content">
        ${input.notice ? renderNotice(input.notice) : ""}
        ${input.body}
      </main>
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
