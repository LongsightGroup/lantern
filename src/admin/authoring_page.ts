import type { DraftFileDiff } from "../authoring/draft_diff.ts";
import type {
  AuthoringDraftRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import {
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from "./layout.ts";

export interface AuthoringPageFileView {
  path: string;
  contents: string;
}

export interface AuthoringGeneratedDraftView {
  prompt: string;
  notes: string[];
  files: AuthoringPageFileView[];
  diffs: DraftFileDiff[];
}

export function renderAuthoringPage(input: {
  packageVersion: PackageVersionRecord;
  draft: AuthoringDraftRecord;
  currentFiles: AuthoringPageFileView[];
  generatedDraft?: AuthoringGeneratedDraftView | null;
  notice?: AdminNotice | null;
}): string {
  const generatedDraft = input.generatedDraft ?? null;
  const pagePath = `/admin/packages/${
    escapeHtml(input.packageVersion.appId)
  }/versions/${
    escapeHtml(
      input.packageVersion.version,
    )
  }/authoring`;

  return renderAdminLayout({
    title:
      `${input.packageVersion.title} ${input.packageVersion.version} Authoring`,
    eyebrow: "Authoring Draft",
    heading: input.packageVersion.title,
    intro:
      "Draft browser-autograder revisions on the server, review the generated changes, and save only the files this reviewed package marked as authoring artifacts.",
    activePath: "/admin/packages",
    breadcrumbs: [
      { label: "Apps", href: "/admin/packages" },
      { label: input.packageVersion.title },
      {
        label: input.packageVersion.version,
        href: `/admin/packages/${
          escapeHtml(input.packageVersion.appId)
        }/versions/${
          escapeHtml(
            input.packageVersion.version,
          )
        }`,
      },
      { label: "Authoring Draft" },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <section class="stack">
          <p class="section-label">Reviewed version</p>
          <h2>Version ${escapeHtml(input.packageVersion.version)}</h2>
          <p>Lantern keeps approved package snapshots immutable. Saved changes here stay in one explicit draft record until a later review flow decides what to do with them.</p>
        </section>
        <section class="stack">
          <p class="section-label">Draft status</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Draft ID</span>
              <span class="fact-value">${escapeHtml(input.draft.draftId)}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Saved source</span>
              <span class="fact-value">${
      escapeHtml(formatSavedSource(input.draft.savedSource))
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Updated</span>
              <span class="fact-value">${
      escapeHtml(formatDateTime(input.draft.updatedAt))
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Last preview</span>
              <span class="fact-value">${
      escapeHtml(formatDateTime(input.draft.lastPreviewedAt))
    }</span>
            </div>
          </div>
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Current authoring files</p>
        <p class="micro muted">Lantern only loads the files named in <code>manifest.authoring</code> for this reviewed package version.</p>
        <div class="line-list">
          ${input.currentFiles.map(renderCurrentFileCard).join("")}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Prompt</p>
        <form method="post" class="stack" action="${pagePath}/generate">
          <div class="field">
            <label for="authoring-prompt">Describe the browser_autograder change Lantern should draft</label>
            <textarea
              id="authoring-prompt"
              name="prompt"
              placeholder="Example: Write a browser_autograder check for missing alt text."
            >${
      escapeHtml(generatedDraft?.prompt ?? input.draft.latestPromptText ?? "")
    }</textarea>
          </div>
          <p class="micro muted">Lantern calls the configured AI writer on the server, then shows generation notes and file diffs before anything is saved.</p>
          <div class="button-row">
            <button type="submit" class="button-primary">Generate draft</button>
            <button type="button" class="button-secondary" disabled>Save draft</button>
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        input.packageVersion.appId,
      )
    }/versions/${
      escapeHtml(input.packageVersion.version)
    }">Back to version details</a>
          </div>
        </form>
      </div>
    </section>
    ${
      generatedDraft === null ? "" : `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Generation notes</p>
        ${
        generatedDraft.notes.length === 0
          ? '<p class="muted">No generation notes were returned.</p>'
          : `<ul class="stack">${
            generatedDraft.notes
              .map((note) => `<li>${escapeHtml(note)}</li>`)
              .join("")
          }</ul>`
      }
        <p class="micro muted">Lantern did not save these changes yet.</p>
        <form method="post" class="stack" action="${pagePath}/save">
          <input type="hidden" name="prompt" value="${
        escapeHtml(generatedDraft.prompt)
      }">
          ${
        generatedDraft.notes
          .map(
            (note) =>
              `<input type="hidden" name="generationNote" value="${
                escapeHtml(note)
              }">`,
          )
          .join("")
      }
          ${
        generatedDraft.files
          .map(
            (file) =>
              `<input type="hidden" name="generatedPath" value="${
                escapeHtml(file.path)
              }">
          <textarea name="generatedContents" hidden>${
                escapeHtml(file.contents)
              }</textarea>`,
          )
          .join("")
      }
          <div class="button-row">
            <button type="submit" class="button-primary">Save draft</button>
            <a class="button-secondary" href="${pagePath}">Discard generated changes</a>
          </div>
        </form>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Draft diff</p>
        <div class="line-list">
          ${generatedDraft.diffs.map(renderDiffCard).join("")}
        </div>
      </div>
    </section>`
    }`,
  });
}

function renderCurrentFileCard(file: AuthoringPageFileView): string {
  return `<article class="line-item">
    <p class="line-title">${escapeHtml(file.path)}</p>
    <pre>${escapeHtml(file.contents)}</pre>
  </article>`;
}

function renderDiffCard(diff: DraftFileDiff): string {
  return `<article class="line-item">
    <p class="line-title">${escapeHtml(diff.path)}</p>
    <p class="micro muted">${escapeHtml(formatDiffStatus(diff.status))}</p>
    <pre>${escapeHtml(formatDiffLines(diff))}</pre>
  </article>`;
}

function formatDiffLines(diff: DraftFileDiff): string {
  if (diff.lines.length === 0) {
    return "(no textual changes)";
  }

  return diff.lines
    .map((line) => `${diffPrefix(line.kind)} ${line.value}`)
    .join("\n");
}

function diffPrefix(kind: DraftFileDiff["lines"][number]["kind"]): string {
  switch (kind) {
    case "context":
      return " ";
    case "removed":
      return "-";
    case "added":
      return "+";
  }
}

function formatDiffStatus(status: DraftFileDiff["status"]): string {
  switch (status) {
    case "unchanged":
      return "No content change";
    case "changed":
      return "Updated file";
    case "added":
      return "New file";
    case "removed":
      return "Removed file";
  }
}

function formatSavedSource(
  savedSource: AuthoringDraftRecord["savedSource"],
): string {
  switch (savedSource) {
    case "manual":
      return "Manual draft save";
    case "ai":
      return "AI-assisted draft save";
  }
}
