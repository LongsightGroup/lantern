import type {
  PackageVersionRecord,
  PreviewSessionRecord,
} from "../package_review/types.ts";
import { type AdminNotice, escapeHtml, renderAdminLayout } from "./layout.ts";

export function renderPreviewPage(input: {
  packageVersion: PackageVersionRecord;
  previewSession: PreviewSessionRecord;
  notice?: AdminNotice | null;
}): string {
  const { packageVersion, previewSession } = input;

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
