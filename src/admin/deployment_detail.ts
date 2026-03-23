import {
  approvalStatusClass,
  approvalStatusLabel,
  describeDeploymentPin,
} from "../package_review/summary.ts";
import type {
  DeploymentRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import {
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from "./layout.ts";

export function buildDefaultDeploymentSeed(
  appId: string,
  appTitle: string,
): {
  slug: string;
  label: string;
} {
  return {
    slug: `${appId}-pilot`,
    label: `${appTitle} Pilot Deployment`,
  };
}

export function renderDeploymentDetailPage(input: {
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  deployment: DeploymentRecord | null;
  notice?: AdminNotice | null;
}): string {
  const seed = buildDefaultDeploymentSeed(input.appId, input.appTitle);
  const approvedVersions = input.history.filter((version) =>
    version.approvalStatus === "approved"
  );
  const activeDeployment = input.deployment ?? {
    id: 0,
    slug: seed.slug,
    label: seed.label,
    appId: input.appId,
    enabledPackageVersionId: null,
    enabledPackageVersion: null,
    updatedAt: input.history[0]?.importedAt ?? new Date().toISOString(),
  };

  return renderAdminLayout({
    title: `${input.appTitle} Deployment`,
    eyebrow: "Deployment Pinning",
    heading: activeDeployment.label,
    intro:
      "Choose one approved version and keep the pin explicit. Lantern never resolves deployment state through a floating latest release.",
    breadcrumbs: [
      { label: "Packages", href: "/admin/packages" },
      {
        label: input.appTitle,
        href: `/admin/packages/${input.appId}/versions/${
          input.history[0]?.version ?? ""
        }`,
      },
      { label: "Deployment" },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Current pin</p>
          <h2>${escapeHtml(describeDeploymentPin(input.deployment))}</h2>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Slug</span>
              <span class="fact-value">${
      escapeHtml(activeDeployment.slug)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">App ID</span>
              <span class="fact-value">${
      escapeHtml(activeDeployment.appId)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Updated</span>
              <span class="fact-value">${
      escapeHtml(formatDateTime(activeDeployment.updatedAt))
    }</span>
            </div>
          </div>
          <div class="callout">
            <h3>Release gate</h3>
            <p>Only versions that are already approved appear in the picker. Pending and rejected versions stay visible in history, but they cannot become active pins.</p>
          </div>
        </div>
        <section class="stack">
          <p class="section-label">Version picker</p>
          <form method="post" action="/admin/packages/${
      escapeHtml(input.appId)
    }/deployment/pin" class="stack">
            <div class="field">
              <label for="package-version-id">Approved version</label>
              <select id="package-version-id" name="packageVersionId" ${
      approvedVersions.length === 0 ? "disabled" : ""
    }>
                ${
      approvedVersions.length === 0
        ? `<option value="">No approved versions available yet</option>`
        : approvedVersions.map((version) =>
          `<option value="${escapeHtml(String(version.id))}" ${
            activeDeployment.enabledPackageVersionId === version.id
              ? "selected"
              : ""
          }>Version ${escapeHtml(version.version)} · ${
            escapeHtml(version.title)
          }</option>`
        ).join("")
    }
              </select>
            </div>
            <div class="button-row">
              <button type="submit" class="button-primary" ${
      approvedVersions.length === 0 ? "disabled" : ""
    }>Save exact version pin</button>
              <a class="button-ghost" href="/admin/packages/${
      escapeHtml(input.appId)
    }/versions/${
      escapeHtml(input.history[0]?.version ?? "")
    }">Back to dossier</a>
            </div>
          </form>
          <p class="micro muted">Saving records the exact package version id and leaves the active pin visible on reload.</p>
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Version history</p>
        <div class="table-list">
          ${
      input.history.map((version) =>
        renderHistoryRow(activeDeployment, version)
      ).join("")
    }
        </div>
      </div>
    </section>`,
  });
}

function renderHistoryRow(
  deployment: Pick<DeploymentRecord, "enabledPackageVersionId">,
  version: PackageVersionRecord,
): string {
  const isPinned = deployment.enabledPackageVersionId === version.id;

  return `<article class="table-row">
    <div class="table-row-top">
      <p class="line-title">
        <span>Version ${escapeHtml(version.version)}</span>
        <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(approvalStatusLabel(version.approvalStatus))
  }</span>
        ${isPinned ? `<span class="chip">Active pin</span>` : ""}
      </p>
      <p class="micro muted">${
    escapeHtml(formatDateTime(version.importedAt))
  }</p>
    </div>
    <p class="line-copy">${
    escapeHtml(version.reviewNotes ?? "No review notes recorded.")
  }</p>
  </article>`;
}
