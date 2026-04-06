import {
  approvalStatusClass,
  approvalStatusDetail,
  approvalStatusLabel,
} from "../package_review/summary.ts";
import {
  ACCESSIBILITY_REVIEW_FIELDS,
  type AccessibilityReview,
  type AccessibilityReviewStatus,
  type PackageVersionRecord,
} from "../package_review/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";

export function renderDecisionSection(
  packageVersion: PackageVersionRecord,
): string {
  if (packageVersion.approvalStatus === "pending") {
    return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Approval</p>
        <h2>Approve or reject this version.</h2>
        <p>
          This decision applies only to this version. If the app needs changes, import a new version instead of editing this one in place.
        </p>
        <form method="post" class="stack">
          <section class="stack">
            <p class="section-label">Accessibility review</p>
            <p class="micro muted">
              Record the required accessibility evidence for this version. Use "Not applicable" only when the reviewed interaction does not apply.
            </p>
            ${
      ACCESSIBILITY_REVIEW_FIELDS.map((field) =>
        renderAccessibilityReviewField(field)
      ).join("")
    }
            <div class="field">
              <label for="accessibility-failure-notes">Accessibility failure notes (optional)</label>
              <textarea
                id="accessibility-failure-notes"
                name="accessibilityFailureNotes"
                placeholder="Record what still needs to change before this version is fully accessible."
              ></textarea>
            </div>
            <div class="field">
              <label for="accessibility-exception-note">Exception note (optional)</label>
              <textarea
                id="accessibility-exception-note"
                name="accessibilityExceptionNote"
                placeholder="Record any narrow exception that was reviewed with this version."
              ></textarea>
            </div>
          </section>
          <div class="field">
            <label for="review-notes">Review notes (optional)</label>
            <textarea id="review-notes" name="reviewNotes" placeholder="Record why this version is ready, or what still needs to change."></textarea>
          </div>
          <div class="button-row">
            <button type="submit" class="button-primary" formaction="/admin/packages/${
      escapeHtml(
        String(packageVersion.id),
      )
    }/approve">Approve version</button>
            <button type="submit" class="button-danger" formaction="/admin/packages/${
      escapeHtml(
        String(packageVersion.id),
      )
    }/reject">Reject version</button>
          </div>
        </form>
      </div>
    </section>`;
  }

  return `<section class="panel">
    <div class="panel-body stack">
      <p class="section-label">Approval</p>
      <h2>${escapeHtml(approvalStatusLabel(packageVersion.approvalStatus))}</h2>
      <p>${escapeHtml(approvalStatusDetail(packageVersion.approvalStatus))}</p>
      ${
    packageVersion.approvalStatus === "approved"
      ? `<div class="button-row">
            <a class="button-primary" href="/admin/packages/${
        escapeHtml(
          packageVersion.appId,
        )
      }/versions/${
        escapeHtml(packageVersion.version)
      }/preview">Open test launch</a>
          </div>`
      : ""
  }
      <div class="facts">
        <div class="fact">
          <span class="fact-label">Reviewed at</span>
          <span class="fact-value">${
    escapeHtml(formatDateTime(packageVersion.reviewedAt))
  }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Review notes</span>
          <span class="fact-value">${
    escapeHtml(
      packageVersion.reviewNotes ?? "No review notes recorded.",
    )
  }</span>
        </div>
      </div>
      ${renderAccessibilityReviewSection(packageVersion)}
    </div>
  </section>`;
}

export function renderHistoryRow(
  currentVersion: PackageVersionRecord,
  version: PackageVersionRecord,
): string {
  const isCurrent = currentVersion.version === version.version;

  return `<article class="table-row">
    <div class="table-row-top">
      <p class="line-title">
        <a href="/admin/packages/${escapeHtml(version.appId)}/versions/${
    escapeHtml(
      version.version,
    )
  }">Version ${escapeHtml(version.version)}</a>
        <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(
      approvalStatusLabel(version.approvalStatus),
    )
  }</span>
        ${isCurrent ? `<span class="chip">Current version</span>` : ""}
      </p>
      <p class="micro muted">${
    escapeHtml(formatDateTime(version.importedAt))
  }</p>
    </div>
    <p class="line-copy">${
    escapeHtml(
      version.reviewNotes ?? approvalStatusDetail(version.approvalStatus),
    )
  }</p>
  </article>`;
}

function renderAccessibilityReviewField(
  field: (typeof ACCESSIBILITY_REVIEW_FIELDS)[number],
): string {
  return `<fieldset class="field">
    <legend>${escapeHtml(field.label)}</legend>
    <div class="chip-row">
      ${renderAccessibilityReviewOption(field.formName, "pass", "Pass", true)}
      ${
    renderAccessibilityReviewOption(
      field.formName,
      "fail",
      "Fail",
      false,
    )
  }
      ${
    renderAccessibilityReviewOption(
      field.formName,
      "not_applicable",
      "Not applicable",
      false,
    )
  }
    </div>
  </fieldset>`;
}

function renderAccessibilityReviewOption(
  fieldName: string,
  value: AccessibilityReviewStatus,
  label: string,
  required: boolean,
): string {
  const id = `${fieldName}-${value}`;

  return `<label for="${escapeHtml(id)}">
    <input
      id="${escapeHtml(id)}"
      type="radio"
      name="${escapeHtml(fieldName)}"
      value="${escapeHtml(value)}"
      ${required ? "required" : ""}
    />
    ${escapeHtml(label)}
  </label>`;
}

function renderAccessibilityReviewSection(
  packageVersion: PackageVersionRecord,
): string {
  const review = packageVersion.accessibilityReview;

  if (review === null) {
    return `<section class="callout callout-review">
      <h3>Accessibility review missing</h3>
      <p>
        This version was reviewed before Lantern required structured accessibility evidence.
      </p>
    </section>`;
  }

  const failedChecks = ACCESSIBILITY_REVIEW_FIELDS.filter(({ key }) =>
    review[key] === "fail"
  );

  return `<section class="stack">
    <p class="section-label">Accessibility review</p>
    <div class="facts">
      <div class="fact">
        <span class="fact-label">Status</span>
        <span class="fact-value">${
    escapeHtml(failedChecks.length === 0 ? "Passed" : "Flagged")
  }</span>
      </div>
      <div class="fact">
        <span class="fact-label">Failed checks</span>
        <span class="fact-value">${
    escapeHtml(
      failedChecks.length === 0
        ? "None recorded."
        : failedChecks.map(({ label }) => label).join(", "),
    )
  }</span>
      </div>
    </div>
    <div class="line-list">
      ${
    ACCESSIBILITY_REVIEW_FIELDS.map((field) =>
      renderAccessibilityReviewItem(review, field.key, field.label)
    ).join("")
  }
      <article class="line-item">
        <p class="line-title">Failure notes</p>
        <p class="line-copy">${
    escapeHtml(review.failureNotes ?? "No failure notes recorded.")
  }</p>
      </article>
      <article class="line-item">
        <p class="line-title">Exception note</p>
        <p class="line-copy">${
    escapeHtml(review.exceptionNote ?? "No exception note recorded.")
  }</p>
      </article>
    </div>
  </section>`;
}

function renderAccessibilityReviewItem(
  review: AccessibilityReview,
  key: keyof Omit<AccessibilityReview, "failureNotes" | "exceptionNote">,
  label: string,
): string {
  return `<article class="line-item">
    <p class="line-title">${escapeHtml(label)}</p>
    <p class="line-copy">${
    escapeHtml(
      formatAccessibilityReviewStatus(review[key]),
    )
  }</p>
  </article>`;
}

function formatAccessibilityReviewStatus(
  status: AccessibilityReviewStatus,
): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "not_applicable":
      return "Not applicable";
  }
}
