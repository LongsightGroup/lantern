import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
  summarizeCapabilities,
  summarizeFlaggedCapabilities,
  summarizeGrading,
  summarizeRoles,
  summarizeValidation,
} from "../package_review/summary.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";
import {
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from "./layout.ts";
import {
  renderDecisionSection,
  renderHistoryRow,
} from "./package_detail_sections.ts";

export function renderPackageDetailPage(input: {
  packageVersion: PackageVersionRecord;
  history: PackageVersionRecord[];
  notice?: AdminNotice | null;
}): string {
  const packageVersion = input.packageVersion;
  const flaggedCapabilities = summarizeFlaggedCapabilities(
    packageVersion.capabilities,
  );
  const capabilitySummary = summarizeCapabilities(packageVersion.capabilities);
  const grading = summarizeGrading(packageVersion.grading);
  const validation = summarizeValidation(packageVersion);

  return renderAdminLayout({
    title: `${packageVersion.title} ${packageVersion.version}`,
    eyebrow: "Version details",
    heading: packageVersion.title,
    intro: "Review this version before you make it live.",
    activePath: "/admin/packages",
    breadcrumbs: [
      { label: "Apps", href: "/admin/packages" },
      { label: packageVersion.title },
      { label: packageVersion.version },
    ],
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="${approvalStatusClass(packageVersion.approvalStatus)}">${
      escapeHtml(
        approvalStatusLabel(packageVersion.approvalStatus),
      )
    }</p>
          <div class="stack">
            <h2>Version ${escapeHtml(packageVersion.version)}</h2>
            <p>${
      escapeHtml(
        packageVersion.description ?? "No package description was provided.",
      )
    }</p>
            <p class="micro muted">${
      escapeHtml(
        approvalStatusDetail(packageVersion.approvalStatus),
      )
    }</p>
          </div>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Owner</span>
              <span class="fact-value">${
      escapeHtml(packageVersion.owner.id)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Available to</span>
              <span class="fact-value">${
      escapeHtml(summarizeRoles(packageVersion.roles))
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Placement</span>
              <span class="fact-value">${
      escapeHtml(
        formatInstallScope(packageVersion.installScope),
      )
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Added</span>
              <span class="fact-value">${
      escapeHtml(
        formatDateTime(packageVersion.importedAt),
      )
    }</span>
            </div>
          </div>
          <section class="stack">
            <p class="section-label">What this app can access</p>
            <div class="chip-row">
              ${
      capabilitySummary
        .map(
          (capability) =>
            `<span class="chip capability-chip ${
              capability.flagged
                ? "capability-chip-flagged"
                : "capability-chip-basic"
            }">${escapeHtml(capability.label)}</span>`,
        )
        .join("")
    }
            </div>
            ${
      flaggedCapabilities.length > 0
        ? `<div class="callout callout-review">
              <h3>Review before approval</h3>
              <p>Approve this version only if these actions match what you expect the app to do.</p>
              <p class="micro muted">If not, reject it. Lantern will keep this version from going live, and you can leave the current approved version in place until a safer update is ready.</p>
              <ul class="capability-review-list">
                ${
          flaggedCapabilities
            .map(
              (capability) =>
                `<li class="capability-review-item">
                  <p class="line-title">
                    <span>${escapeHtml(capability.label)}</span>
                    ${
                  capability.flagLabel
                    ? `<span class="chip capability-risk-chip">${
                      escapeHtml(
                        capability.flagLabel,
                      )
                    }</span>`
                    : ""
                }
                  </p>
                  <p class="line-copy">${escapeHtml(capability.detail)}</p>
                </li>`,
            )
            .join("")
        }
              </ul>
            </div>`
        : ""
    }
          </section>
        </div>
        <aside class="stack">
          <section class="fact">
            <span class="fact-label">Scoring</span>
            <strong class="fact-value">${escapeHtml(grading.label)}</strong>
            <p class="micro muted">${escapeHtml(grading.detail)}</p>
          </section>
          <section class="fact">
            <span class="fact-label">Checks</span>
            <strong class="fact-value">${escapeHtml(validation.label)}</strong>
            <p class="micro muted">${escapeHtml(validation.detail)}</p>
          </section>
          <section class="fact">
            <span class="fact-label">Next step</span>
            <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        packageVersion.appId,
      )
    }/deployment">Open app settings</a>
          </section>
        </aside>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body grid">
        <div class="stack">
          <p class="section-label">More details</p>
          <details>
            <summary>Show access notes and saved file details</summary>
            <div class="line-list">
              ${
      capabilitySummary
        .map(
          (capability) =>
            `<article class="line-item">
              <p class="line-title">${escapeHtml(capability.label)}${
              capability.flagLabel
                ? ` <span class="micro muted">${
                  escapeHtml(capability.flagLabel)
                }</span>`
                : ""
            }</p>
              <p class="line-copy">${escapeHtml(capability.detail)}</p>
            </article>`,
        )
        .join("")
    }
              <article class="line-item">
                <p class="line-title">Scoring setup</p>
                <p class="line-copy">${escapeHtml(grading.detail)}</p>
              </article>
              <article class="line-item">
                <p class="line-title">Saved files</p>
                <p class="line-copy">Lantern saved a reviewed copy in ${
      escapeHtml(
        packageVersion.artifact.snapshotRoot,
      )
    } with checksum ${escapeHtml(packageVersion.artifact.digest)}.</p>
              </article>
            </div>
          </details>
        </div>
        ${
      validation.issues.length > 0
        ? `<section class="callout">
              <h3>Things to fix</h3>
              <ul>
                ${
          validation.issues
            .map(
              (issue) =>
                `<li><strong>${escapeHtml(issue.field)}</strong>: ${
                  escapeHtml(
                    issue.message,
                  )
                }</li>`,
            )
            .join("")
        }
              </ul>
            </section>`
        : ""
    }
      </div>
    </section>
    ${renderDecisionSection(packageVersion)}
    <section class="panel">
      <div class="panel-body two-column">
        <section class="stack">
          <p class="section-label">Other versions</p>
          <div class="table-list">
            ${
      input.history.map((version) => renderHistoryRow(packageVersion, version))
        .join("")
    }
          </div>
        </section>
        <section class="stack">
          <p class="section-label">Technical details</p>
          <details>
            <summary>Show manifest JSON</summary>
            <pre>${
      escapeHtml(JSON.stringify(packageVersion.manifestJson, null, 2))
    }</pre>
          </details>
        </section>
      </div>
    </section>`,
  });
}

function formatInstallScope(
  scope: PackageVersionRecord["installScope"],
): string {
  return scope === "assignment" ? "Assignment placement" : "Course placement";
}
