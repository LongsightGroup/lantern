import { buildDeepLinkingSelectionValue } from "../lti/deep_linking.ts";
import type { DeepLinkingSessionRecord } from "../lti/types.ts";
import type {
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
} from "../package_review/types.ts";
import { type AdminNotice, escapeHtml, formatDateTime } from "./layout.ts";

export function renderDeepLinkingPickerPage(input: {
  session?: Pick<
    DeepLinkingSessionRecord,
    "appId" | "contextTitle" | "deploymentSlug" | "expiresAt"
  >;
  sessionId?: string;
  token?: string;
  resources: DeepLinkingResourceOption[];
  selection: DeepLinkingResourceSelection | null;
  notice?: AdminNotice | null;
}): string {
  const session = input.session ?? {
    appId: "app",
    contextTitle: null,
    deploymentSlug: "deployment",
    expiresAt: null,
  };
  const saveAction = input.sessionId
    ? `/lti/deep-linking/sessions/${encodeURIComponent(input.sessionId)}`
    : "#";
  const submitAction = input.sessionId
    ? `/lti/deep-linking/sessions/${encodeURIComponent(input.sessionId)}/submit`
    : "#";
  const canSave = input.resources.length > 0;
  const canReturn = input.selection !== null &&
    input.sessionId !== undefined &&
    input.token !== undefined;
  const returnStateCopy = input.selection === null
    ? "Save one reviewed selection before returning to Canvas."
    : input.sessionId === undefined || input.token === undefined
    ? "Return to Canvas is unavailable until Lantern can verify this session."
    : "Ready to return to Canvas from this saved reviewed selection.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lantern Deep Linking Picker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --bg: linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
        --surface: #ffffff;
        --surface-soft: #f8fafc;
        --ink: #0f172a;
        --muted: #475569;
        --line: #d9e2ec;
        --accent: #14532d;
        --accent-soft: #e8f5eb;
        --accent-strong: #166534;
        --warn: #9a3412;
        --warn-soft: #fff3ec;
        --error: #b42318;
        --error-soft: #fef3f2;
        --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        --radius: 18px;
        --radius-sm: 12px;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
      }

      body {
        font: 14px/1.55 var(--font);
        color: var(--ink);
        background: var(--bg);
        padding: 24px;
      }

      main {
        max-width: 920px;
        margin: 0 auto;
      }

      .shell {
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(217, 226, 236, 0.9);
        border-radius: 28px;
        padding: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }

      .hero {
        display: grid;
        gap: 16px;
        padding: 22px;
        border-radius: 22px;
        background:
          radial-gradient(circle at top right, rgba(20, 83, 45, 0.12), transparent 36%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94));
        border: 1px solid rgba(217, 226, 236, 0.85);
      }

      .eyebrow {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent-strong);
      }

      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }

      .hero-copy {
        margin: 0;
        max-width: 62ch;
        color: var(--muted);
      }

      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }

      .fact {
        padding: 14px;
        border-radius: 16px;
        background: var(--surface);
        border: 1px solid var(--line);
      }

      .fact-label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .fact-value {
        font-size: 15px;
        font-weight: 600;
      }

      .notice {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
      }

      .notice.error {
        background: var(--error-soft);
        border-color: rgba(180, 35, 24, 0.18);
      }

      .notice.success {
        background: var(--accent-soft);
        border-color: rgba(20, 83, 45, 0.16);
      }

      .notice.note {
        background: var(--warn-soft);
        border-color: rgba(154, 52, 18, 0.16);
      }

      .notice h2 {
        margin: 0 0 6px;
        font-size: 1rem;
      }

      .notice p {
        margin: 0;
        color: var(--muted);
      }

      .layout {
        display: grid;
        gap: 18px;
        margin-top: 18px;
      }

      .selection-panel,
      .resource-panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px;
      }

      .section-label {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .selection-summary {
        padding: 14px;
        border-radius: 16px;
        background: var(--surface-soft);
        border: 1px solid var(--line);
      }

      .selection-summary strong {
        display: block;
        margin-bottom: 4px;
        font-size: 0.95rem;
      }

      .selection-summary p {
        margin: 0;
        color: var(--muted);
      }

      .resource-list {
        display: grid;
        gap: 12px;
      }

      .resource-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 14px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--surface);
        cursor: pointer;
      }

      .resource-card.selected {
        border-color: rgba(20, 83, 45, 0.34);
        background: linear-gradient(180deg, #ffffff 0%, #f4fbf6 100%);
        box-shadow: inset 0 0 0 1px rgba(20, 83, 45, 0.06);
      }

      .resource-card input {
        margin-top: 4px;
      }

      .resource-card h2 {
        margin: 0 0 4px;
        font-size: 1.05rem;
      }

      .resource-kicker,
      .resource-meta,
      .resource-path {
        margin: 0;
      }

      .resource-kicker {
        color: var(--accent-strong);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .resource-path {
        margin-top: 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: var(--muted);
      }

      .resource-meta {
        color: var(--muted);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }

      button,
      .phase-note {
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
      }

      button {
        border: none;
        cursor: pointer;
      }

      .button-primary {
        background: var(--accent);
        color: white;
        font-weight: 600;
      }

      .button-primary:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .phase-note {
        display: inline-flex;
        align-items: center;
        background: var(--surface-soft);
        border: 1px solid var(--line);
        color: var(--muted);
      }

      .empty {
        padding: 18px;
        border-radius: 18px;
        background: var(--surface-soft);
        border: 1px dashed var(--line);
        color: var(--muted);
      }

      @media (max-width: 720px) {
        body {
          padding: 12px;
        }

        .shell {
          padding: 12px;
          border-radius: 20px;
        }

        .hero,
        .selection-panel,
        .resource-panel {
          padding: 16px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <section class="hero">
          <div>
            <p class="eyebrow">Lantern Deep Linking</p>
            <h1>Select one reviewed resource for assignment placement.</h1>
            <p class="hero-copy">
              Lantern keeps the reviewed package version and content path explicit here.
              Save one reviewed selection first, then return that saved choice to Canvas from a separate verified action.
            </p>
          </div>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Course context</span>
              <span class="fact-value">${
    escapeHtml(session.contextTitle ?? "Canvas context")
  }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Bound app</span>
              <span class="fact-value">${escapeHtml(session.appId)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Deployment</span>
              <span class="fact-value">${
    escapeHtml(session.deploymentSlug)
  }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Session expiry</span>
              <span class="fact-value">${
    escapeHtml(formatDateTime(session.expiresAt ?? null))
  }</span>
            </div>
          </div>
          ${renderNotice(input.notice ?? null)}
        </section>
        <div class="layout">
          <section class="selection-panel">
            <p class="section-label">Selection state</p>
            ${
    input.selection === null
      ? `<div class="selection-summary">
              <strong>No reviewed resource selected yet.</strong>
              <p>Choose one approved assignment resource below. Lantern will store the reviewed version and canonical content path explicitly.</p>
            </div>`
      : `<div class="selection-summary">
              <strong>${escapeHtml(input.selection.packageTitle)} ${
        escapeHtml(input.selection.packageVersion)
      }</strong>
              <p>${
        escapeHtml(
          input.selection.contentTitle ?? input.selection.contentPath,
        )
      }</p>
              <p class="resource-path">${
        escapeHtml(input.selection.contentPath)
      }</p>
            </div>`
  }
          </section>
          <section class="resource-panel">
            <p class="section-label">Reviewed resources</p>
            <form method="post" action="${escapeHtml(saveAction)}">
              ${
    input.token === undefined
      ? ""
      : `<input type="hidden" name="token" value="${escapeHtml(input.token)}">`
  }
              ${
    input.resources.length === 0
      ? `<div class="empty">
              No approved assignment-scope reviewed resources are available for this app yet.
            </div>`
      : `<div class="resource-list">
              ${
        input.resources.map((resource) =>
          renderResourceCard(resource, input.selection)
        ).join("")
      }
            </div>`
  }
              <div class="actions">
                <button type="submit" class="button-primary" ${
    canSave ? "" : "disabled"
  }>Save reviewed selection</button>
              </div>
            </form>
            <form method="post" action="${escapeHtml(submitAction)}">
              ${
    input.token === undefined
      ? ""
      : `<input type="hidden" name="token" value="${escapeHtml(input.token)}">`
  }
              <div class="actions">
                <button type="submit" class="button-primary" ${
    canReturn ? "" : "disabled"
  }>Return to Canvas</button>
                <span class="phase-note">${escapeHtml(returnStateCopy)}</span>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  </body>
</html>`;
}

function renderNotice(notice: AdminNotice | null): string {
  if (notice === null) {
    return "";
  }

  return `<section class="notice ${escapeHtml(notice.tone)}">
    <h2>${escapeHtml(notice.title)}</h2>
    <p>${escapeHtml(notice.detail)}</p>
  </section>`;
}

function renderResourceCard(
  resource: DeepLinkingResourceOption,
  selection: DeepLinkingResourceSelection | null,
): string {
  const checked = selection !== null &&
    selection.packageVersionId === resource.packageVersionId &&
    selection.contentPath === resource.contentPath;

  return `<label class="resource-card ${checked ? "selected" : ""}">
    <input
      type="radio"
      name="selection"
      value="${
    escapeHtml(
      buildDeepLinkingSelectionValue({
        packageVersionId: resource.packageVersionId,
        contentPath: resource.contentPath,
      }),
    )
  }"
      ${checked ? "checked" : ""}
    >
    <div>
      <p class="resource-kicker">${escapeHtml(resource.packageTitle)}</p>
      <h2>Version ${escapeHtml(resource.packageVersion)}</h2>
      <p class="resource-meta">${
    escapeHtml(resource.contentTitle ?? "Canonical content path")
  }</p>
      <p class="resource-path">${escapeHtml(resource.contentPath)}</p>
      <p class="resource-meta">Reviewed ${
    escapeHtml(formatDateTime(resource.reviewedAt))
  }</p>
    </div>
  </label>`;
}
