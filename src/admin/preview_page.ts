import type {
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from "../package_review/types.ts";
import { type AdminNotice, escapeHtml, renderAdminLayout } from "./layout.ts";

export function renderPreviewPage(input: {
  packageVersion: PackageVersionRecord;
  previewSession: PreviewSessionRecord;
  previewEvidence: PreviewEvidenceRecord[];
  notice?: AdminNotice | null;
}): string {
  const { packageVersion, previewSession, previewEvidence } = input;

  return renderAdminLayout({
    title: `${packageVersion.title} ${packageVersion.version} Preview`,
    eyebrow: "Governed Preview",
    heading: packageVersion.title,
    intro:
      "Launch a reviewed fixture-backed preview without Canvas. Lantern keeps the preview inside the existing runtime session boundary.",
    breadcrumbs: [
      { label: "Packages", href: "/admin/packages" },
      { label: packageVersion.title },
      {
        label: packageVersion.version,
        href: `/admin/packages/${escapeHtml(packageVersion.appId)}/versions/${
          escapeHtml(packageVersion.version)
        }`,
      },
      { label: "Preview" },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Governed preview launch</p>
        <h2>Version ${escapeHtml(packageVersion.version)}</h2>
        <p>Lantern will create one runtime session using reviewed preview fixtures. No Canvas login or launch is used for this path.</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body two-column">
        <section class="stack">
          <p class="section-label">Reviewed package identity</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">App</span>
              <span class="fact-value">${
      escapeHtml(packageVersion.appId)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Version</span>
              <span class="fact-value">${
      escapeHtml(packageVersion.version)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Snapshot</span>
              <span class="fact-value">${
      escapeHtml(packageVersion.artifact.snapshotRoot)
    }</span>
            </div>
          </div>
        </section>
        <section class="stack">
          <p class="section-label">Fixture-backed launch context</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">User role</span>
              <span class="fact-value">${
      escapeHtml(previewSession.launch.userRole)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Course</span>
              <span class="fact-value">${
      escapeHtml(previewSession.launch.courseId)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Assignment</span>
              <span class="fact-value">${
      escapeHtml(previewSession.launch.assignmentId ?? "Not provided")
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Activity</span>
              <span class="fact-value">${
      escapeHtml(previewSession.launch.activityId)
    }</span>
            </div>
          </div>
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Declared capabilities</p>
        <ul class="compact-list">
          ${
    previewSession.capabilities.map((capability) =>
      `<li><code>${escapeHtml(capability)}</code></li>`
    ).join("")
  }
        </ul>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Preview capability log</p>
        <p class="micro muted">Latest preview session: ${
    escapeHtml(previewSession.sessionId)
  }</p>
        ${
    previewEvidence.length === 0
      ? `<p class="muted">No preview activity has been recorded yet. Launch the preview runtime to capture governed capability evidence.</p>`
      : `<ul class="stack">
          ${
        previewEvidence.map((record) =>
          `<li class="stack">
              <div class="micro muted">${escapeHtml(record.occurredAt)}</div>
              <div><strong>${escapeHtml(record.eventType)}</strong> ${
            record.capability === null
              ? ""
              : `<code>${escapeHtml(record.capability)}</code>`
          }</div>
              <div>${escapeHtml(record.summary)}</div>
              <div class="micro muted">${escapeHtml(formatPreviewEvidenceDetail(record.detail))}</div>
            </li>`
        ).join("")
      }
        </ul>`
  }
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <form method="post" class="stack" action="/admin/packages/${
      escapeHtml(packageVersion.appId)
    }/versions/${escapeHtml(packageVersion.version)}/preview">
          <p class="micro muted">Launching writes preview evidence and redirects to Lantern runtime session URL.</p>
          <div class="button-row">
            <button type="submit" class="button-primary">Launch preview runtime</button>
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(packageVersion.appId)
    }/versions/${escapeHtml(packageVersion.version)}">Back to dossier</a>
          </div>
        </form>
      </div>
    </section>`,
  });
}

function formatPreviewEvidenceDetail(detail: Record<string, unknown>): string {
  const source = JSON.stringify(detail);

  if (source.length <= 180) {
    return source;
  }

  return `${source.slice(0, 177)}...`;
}
