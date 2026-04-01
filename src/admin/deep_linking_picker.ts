import { buildDeepLinkingSelectionValue } from "../lti/deep_linking.ts";
import type { DeepLinkingSessionRecord } from "../lti/types.ts";
import type {
  DeepLinkingResourceOption,
  DeepLinkingResourceSelection,
} from "../package_review/types.ts";
import { DEEP_LINKING_PICKER_STYLES } from "./deep_linking_picker_styles.ts";
import { type AdminNotice, escapeHtml, formatDateTime } from "./layout.ts";

export function renderDeepLinkingPickerPage(input: {
  session?: Pick<
    DeepLinkingSessionRecord,
    "appId" | "contextTitle" | "deploymentSlug" | "expiresAt" | "placement"
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
    placement: "assignment_selection",
  };
  const scopeLabel = session.placement === "resource_selection"
    ? "course"
    : "assignment";
  const scopeResourceLabel = session.placement === "resource_selection"
    ? "course resource"
    : "assignment resource";
  const placementLabel = session.placement === "resource_selection"
    ? "course placement"
    : "assignment placement";
  const saveAction = input.sessionId
    ? `/lti/deep-linking/sessions/${encodeURIComponent(input.sessionId)}`
    : "#";
  const submitAction = input.sessionId
    ? `/lti/deep-linking/sessions/${encodeURIComponent(input.sessionId)}/submit`
    : "#";
  const canSave = input.resources.length > 0;
  const canReturn = input.selection !== null && input.sessionId !== undefined &&
    input.token !== undefined;
  const returnStateCopy = input.selection === null
    ? `Save one reviewed ${scopeResourceLabel} before returning it to the LMS.`
    : input.sessionId === undefined || input.token === undefined
    ? "Return to LMS is unavailable until Lantern can verify this session."
    : `Ready to return this reviewed ${scopeResourceLabel} to the LMS.`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lantern Deep Linking Picker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>${DEEP_LINKING_PICKER_STYLES}
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <section class="hero">
          <div>
            <p class="eyebrow">Lantern Deep Linking</p>
            <h1>Select one reviewed resource for ${placementLabel}.</h1>
            <p class="hero-copy">
              Lantern keeps the reviewed package version and content path explicit here.
              Save one reviewed selection first, then return that saved choice to the LMS from a separate verified action.
            </p>
          </div>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Course context</span>
              <span class="fact-value">${
    escapeHtml(
      session.contextTitle ?? "LMS context",
    )
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
    escapeHtml(
      formatDateTime(session.expiresAt ?? null),
    )
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
              <p>Choose one approved ${scopeLabel} resource below. Lantern will store the reviewed version and canonical content path explicitly.</p>
            </div>`
      : `<div class="selection-summary">
              <strong>${escapeHtml(input.selection.packageTitle)} ${
        escapeHtml(
          input.selection.packageVersion,
        )
      }</strong>
              <p>${
        escapeHtml(input.selection.contentTitle ?? input.selection.contentPath)
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
              No approved ${scopeLabel}-scope reviewed resources are available for this app yet.
            </div>`
      : `<div class="resource-list">
              ${
        input.resources
          .map((resource) => renderResourceCard(resource, input.selection))
          .join("")
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
  }>Return to LMS</button>
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
