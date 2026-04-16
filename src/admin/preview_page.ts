import type {
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from "../package_review/types.ts";
import { summarizeCapabilities } from "../package_review/summary.ts";
import { type AdminNotice, escapeHtml, renderAdminLayout } from "./layout.ts";
import { renderPackagePageNav } from "./package_navigation.ts";

export interface TestLaunchFormValues {
  userRole: string;
  courseId: string;
  assignmentId: string;
  activityId: string;
}

export function renderPreviewPage(input: {
  packageVersion: PackageVersionRecord;
  savedDefaults: PreviewSessionRecord;
  latestSession: PreviewSessionRecord | null;
  formValues: TestLaunchFormValues;
  previewEvidence: PreviewEvidenceRecord[];
  notice?: AdminNotice | null;
}): string {
  const { packageVersion, savedDefaults, latestSession, previewEvidence } =
    input;
  const capabilitySummary = summarizeCapabilities(packageVersion.capabilities);

  return renderAdminLayout({
    title: `${packageVersion.title} ${packageVersion.version} Test Launch`,
    eyebrow: "Test Launch",
    heading: packageVersion.title,
    intro:
      "Open this approved version as a student or instructor without signing in through the LMS.",
    activePath: "/admin/packages",
    breadcrumbs: [
      { label: "Apps", href: "/admin/packages" },
      {
        label: packageVersion.title,
        href: `/admin/packages/${escapeHtml(packageVersion.appId)}`,
      },
      {
        label: packageVersion.version,
        href: `/admin/packages/${escapeHtml(packageVersion.appId)}/versions/${
          escapeHtml(
            packageVersion.version,
          )
        }`,
      },
      { label: "Test Launch" },
    ],
    notice: input.notice ?? null,
    pageNav: renderPackagePageNav({
      appId: packageVersion.appId,
      history: [packageVersion],
      currentSection: "preview",
      currentVersion: packageVersion,
    }),
    body: `<section class="panel">
      <div class="panel-body stack">
        <div class="preview-launch-stack">
          <p class="section-label">Test launch</p>
          <h2>Version ${escapeHtml(packageVersion.version)}</h2>
          <p class="micro muted">Defaults ${
      renderLaunchSummary(
        savedDefaults.launch,
      )
    }. No LMS sign-in or live LMS writes.</p>
          <form method="post" class="stack" action="/admin/packages/${
      escapeHtml(
        packageVersion.appId,
      )
    }/versions/${escapeHtml(packageVersion.version)}/preview">
          <div class="form-stack preview-launch-form">
            <div class="field">
              <label for="test-launch-role">Role</label>
              <select id="test-launch-role" name="userRole">
                ${
      packageVersion.roles
        .map(
          (role) =>
            `<option value="${escapeHtml(role)}"${
              input.formValues.userRole === role ? " selected" : ""
            }>${escapeHtml(formatRoleLabel(role))}</option>`,
        )
        .join("")
    }
              </select>
            </div>
            <div class="field">
              <label for="test-launch-course-id">Course ID</label>
              <input
                id="test-launch-course-id"
                name="courseId"
                type="text"
                value="${escapeHtml(input.formValues.courseId)}"
              >
            </div>
            <div class="field">
              <label for="test-launch-assignment-id">Assignment ID</label>
              <input
                id="test-launch-assignment-id"
                name="assignmentId"
                type="text"
                value="${escapeHtml(input.formValues.assignmentId)}"
              >
              <p class="field-hint">Leave blank for a course-level launch.</p>
            </div>
            <div class="field">
              <label for="test-launch-activity-id">Activity ID</label>
              <input
                id="test-launch-activity-id"
                name="activityId"
                type="text"
                value="${escapeHtml(input.formValues.activityId)}"
              >
            </div>
          </div>
            <div class="button-row form-actions">
              <button type="submit" class="button-primary">Start test launch</button>
              <a class="button-secondary" href="/admin/packages/${
      escapeHtml(
        packageVersion.appId,
      )
    }/versions/${
      escapeHtml(packageVersion.version)
    }">Back to version details</a>
            </div>
          </form>
          <details>
            <summary>Show reviewed runtime capabilities</summary>
            <div class="detail-stack">
              <p class="micro muted">This test session can only use the reviewed runtime capabilities saved with this package version.</p>
              <div class="line-list">
                ${
      capabilitySummary
        .map(
          (capability) =>
            `<article class="line-item">
              <p class="line-title">${escapeHtml(capability.label)}</p>
              <p class="line-copy">${escapeHtml(capability.detail)}</p>
            </article>`,
        )
        .join("")
    }
              </div>
            </div>
          </details>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Recent test activity</p>
        ${
      latestSession === null ? "" : `<p>Latest session <strong>${
        escapeHtml(
          latestSession.sessionId,
        )
      }</strong> ran ${renderLaunchSummary(latestSession.launch)}.</p>`
    }
        ${
      previewEvidence.length === 0
        ? `<p class="muted">No test activity has been recorded yet. Start a test launch to open the app.</p>`
        : `<div class="line-list">
          ${
          previewEvidence
            .map(
              (record) =>
                `<article class="line-item">
              <p class="line-title">${
                  escapeHtml(formatPreviewEvidenceLabel(record.eventType))
                }${
                  record.capability === null
                    ? ""
                    : ` <span class="inline-code">${
                      escapeHtml(record.capability)
                    }</span>`
                }
              </p>
              <p class="micro muted">${escapeHtml(record.occurredAt)}</p>
              <p class="micro muted"><span class="inline-code">${
                  escapeHtml(
                    record.eventType,
                  )
                }</span></p>
              <p class="line-copy">${escapeHtml(record.summary)}</p>
              ${renderPreviewEvidenceDetail(packageVersion.appId, record)}
            </article>`,
            )
            .join("")
        }
        </div>`
    }
      </div>
    </section>`,
  });
}

function renderPreviewEvidenceDetail(
  appId: string,
  record: PreviewEvidenceRecord,
): string {
  const artifactUrl = resolvePreviewEvidenceArtifactUrl(appId, record.detail);
  const source = JSON.stringify(
    artifactUrl === null ? record.detail : {
      ...record.detail,
      artifactUrl,
    },
  );
  const detailText = source.length <= 180
    ? source
    : `${source.slice(0, 177)}...`;

  if (artifactUrl === null) {
    return `<div class="micro muted">${escapeHtml(detailText)}</div>`;
  }

  const fileName = readPreviewEvidenceFileName(record.detail) ??
    "Evidence artifact";
  const isScreenshot = isPreviewScreenshotEvidence(record.detail);

  if (isScreenshot) {
    return `<p class="micro muted">Supplemental screenshot evidence. Helpful for review, not exhaustive proof of learner behavior.</p>
    <div class="micro muted">
      <a href="${escapeHtml(artifactUrl)}">${escapeHtml(fileName)}</a>
    </div>
    <img src="${escapeHtml(artifactUrl)}" alt="${
      escapeHtml(`Supplemental screenshot evidence ${fileName}`)
    }" loading="lazy" style="max-width: 100%; height: auto;">
    <div class="micro muted">${escapeHtml(detailText)}</div>`;
  }

  return `<div class="micro muted">
      <a href="${escapeHtml(artifactUrl)}">${escapeHtml(fileName)}</a>
    </div>
    <div class="micro muted">${escapeHtml(detailText)}</div>`;
}

function resolvePreviewEvidenceArtifactUrl(
  appId: string,
  detail: Record<string, unknown>,
): string | null {
  const artifactUrl = readPreviewEvidenceString(detail, "artifactUrl");

  if (artifactUrl !== null) {
    return artifactUrl;
  }

  const artifactId = readPreviewEvidenceString(detail, "artifactId");

  return artifactId === null
    ? null
    : `/admin/packages/${appId}/deployment/evidence/${artifactId}`;
}

function readPreviewEvidenceFileName(
  detail: Record<string, unknown>,
): string | null {
  return readPreviewEvidenceString(detail, "fileName");
}

function isPreviewScreenshotEvidence(detail: Record<string, unknown>): boolean {
  return readPreviewEvidenceString(detail, "kind") === "screenshot_png" ||
    readPreviewEvidenceString(detail, "contentType") === "image/png";
}

function readPreviewEvidenceString(
  detail: Record<string, unknown>,
  key: string,
): string | null {
  const value = detail[key];

  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function formatRoleLabel(role: string): string {
  switch (role) {
    case "learner":
      return "Student";
    case "instructor":
      return "Instructor";
    default:
      return role;
  }
}

function renderLaunchSummary(launch: PreviewSessionRecord["launch"]): string {
  const assignment = launch.assignmentId === null
    ? "a course-level launch"
    : `assignment <span class="inline-code">${
      escapeHtml(launch.assignmentId)
    }</span>`;

  return `as ${
    escapeHtml(
      formatRoleLabel(launch.userRole),
    )
  } in course <span class="inline-code">${
    escapeHtml(
      launch.courseId,
    )
  }</span>, ${assignment}, with activity <span class="inline-code">${
    escapeHtml(
      launch.activityId,
    )
  }</span>`;
}

function formatPreviewEvidenceLabel(eventType: string): string {
  switch (eventType) {
    case "preview.launch":
      return "Started test launch";
    case "preview.content_read":
      return "Loaded app content";
    case "preview.attempt_event":
      return "Received app progress update";
    case "preview.evidence_artifact":
      return "Stored anonymous evidence";
    case "preview.finalize":
      return "Finished test attempt";
    default:
      return eventType;
  }
}
