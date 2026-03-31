import type {
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from "../package_review/types.ts";
import { summarizeCapabilities } from "../package_review/summary.ts";
import { type AdminNotice, escapeHtml, renderAdminLayout } from "./layout.ts";

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
  const launchSummary = latestSession?.launch ?? savedDefaults.launch;

  return renderAdminLayout({
    title: `${packageVersion.title} ${packageVersion.version} Test Launch`,
    eyebrow: "Test Launch",
    heading: packageVersion.title,
    intro:
      "Open this approved version as a student or instructor without signing in through the LMS.",
    breadcrumbs: [
      { label: "Apps", href: "/admin/packages" },
      { label: packageVersion.title },
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
    body: `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Test launch</p>
        <h2>Version ${escapeHtml(packageVersion.version)}</h2>
        <p>Lantern starts with the saved test data from this app version, then opens one runtime session with the role and launch details you choose below.</p>
        <p class="micro muted">This does not use an LMS sign-in, live grade return, or live roster access.</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body two-column">
        <section class="stack">
          <p class="section-label">Version</p>
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
              <span class="fact-label">Saved files</span>
              <span class="fact-value">${
      escapeHtml(packageVersion.artifact.snapshotRoot)
    }</span>
            </div>
          </div>
        </section>
        <section class="stack">
          <p class="section-label">Saved defaults</p>
          <p class="micro muted">These values come from the reviewed app package. You can change them before starting a test session.</p>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Role</span>
              <span class="fact-value">${
      escapeHtml(
        formatRoleLabel(savedDefaults.launch.userRole),
      )
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Course</span>
              <span class="fact-value">${
      escapeHtml(savedDefaults.launch.courseId)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Assignment</span>
              <span class="fact-value">${
      escapeHtml(
        savedDefaults.launch.assignmentId ?? "Course-level launch",
      )
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Activity</span>
              <span class="fact-value">${
      escapeHtml(savedDefaults.launch.activityId)
    }</span>
            </div>
          </div>
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Launch settings</p>
        <form method="post" class="stack" action="/admin/packages/${
      escapeHtml(
        packageVersion.appId,
      )
    }/versions/${escapeHtml(packageVersion.version)}/preview">
          <div class="two-column">
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
              <p class="field-hint">Choose the LMS role to simulate.</p>
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
          <p class="micro muted">Starting a test launch saves activity here and opens the app in Lantern's runtime.</p>
          <div class="button-row">
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
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">What this test allows</p>
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
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Recent test activity</p>
        <div class="facts">
          <div class="fact">
            <span class="fact-label">Latest session</span>
            <span class="fact-value">${
      escapeHtml(latestSession?.sessionId ?? "None yet")
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Role</span>
            <span class="fact-value">${
      escapeHtml(formatRoleLabel(launchSummary.userRole))
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Course</span>
            <span class="fact-value">${
      escapeHtml(launchSummary.courseId)
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Assignment</span>
            <span class="fact-value">${
      escapeHtml(
        launchSummary.assignmentId ?? "Course-level launch",
      )
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Activity</span>
            <span class="fact-value">${
      escapeHtml(launchSummary.activityId)
    }</span>
          </div>
        </div>
        ${
      previewEvidence.length === 0
        ? `<p class="muted">No test activity has been recorded yet. Start a test launch to open the app.</p>`
        : `<ul class="stack">
          ${
          previewEvidence
            .map(
              (record) =>
                `<li class="stack">
              <div class="micro muted">${escapeHtml(record.occurredAt)}</div>
              <div><strong>${
                  escapeHtml(formatPreviewEvidenceLabel(record.eventType))
                }</strong> ${
                  record.capability === null
                    ? ""
                    : `<code>${escapeHtml(record.capability)}</code>`
                }</div>
              <div class="micro muted"><code>${
                  escapeHtml(record.eventType)
                }</code></div>
              <div>${escapeHtml(record.summary)}</div>
              <div class="micro muted">${
                  escapeHtml(
                    formatPreviewEvidenceDetail(record.detail),
                  )
                }</div>
            </li>`,
            )
            .join("")
        }
        </ul>`
    }
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

function formatPreviewEvidenceLabel(eventType: string): string {
  switch (eventType) {
    case "preview.launch":
      return "Started test launch";
    case "preview.content_read":
      return "Loaded app content";
    case "preview.attempt_event":
      return "Received app progress update";
    case "preview.finalize":
      return "Finished test attempt";
    default:
      return eventType;
  }
}
