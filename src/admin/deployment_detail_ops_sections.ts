import { summarizePilotUsage } from "../ops/service.ts";
import type {
  ManagedDeploymentSlot,
} from "./deployment_detail.ts";
import type {
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneDiagnosticItem,
  ControlPlaneHealthDimension,
  ControlPlaneHealthStatus,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
  InternalBrokerVerificationStatus,
} from "../ops/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";

export function renderControlPlaneStatusSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const health = detail?.inventory.health ?? null;

  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Operations</p>
          <h2>Current status</h2>
          <p>Keep the deployment's release state, latest launch evidence, latest AGS write, and latest NRPS read on one governed admin page.</p>
          <div class="facts">
            ${
    renderActivityFact(
      "Overall status",
      describeOverallStatus(health?.overallStatus ?? null),
      health?.summary ?? "No control-plane status has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Last launch",
      formatActivityTimestamp(detail?.latestLaunch),
      detail?.latestLaunch?.summary ?? "No launch has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Last AGS write",
      formatGradePublicationTimestamp(detail?.latestGradePublish),
      detail?.latestGradePublish
        ? describeGradePublication(detail.latestGradePublish)
        : "No grade publish has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Last NRPS read",
      formatActivityTimestamp(detail?.latestNrpsRead),
      detail?.latestNrpsRead?.summary ?? "Roster verification has not run yet.",
    )
  }
          </div>
        </div>
        <section class="stack">
          <p class="section-label">Status dimensions</p>
          <h2>Readable control-plane facts</h2>
          <div class="table-list">
            ${renderDimensionRow("Review", health?.dimensions.review ?? null)}
            ${
    renderDimensionRow("Enablement", health?.dimensions.enablement ?? null)
  }
            ${renderDimensionRow("Launch", health?.dimensions.launch ?? null)}
            ${
    renderDimensionRow(
      "AGS publish",
      health?.dimensions.gradePublication ?? null,
    )
  }
            ${renderDimensionRow("NRPS", health?.dimensions.nrps ?? null)}
          </div>
        </section>
      </div>
    </section>`;
}

export function renderPilotUsageSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const pilotUsageFacts = detail === null
    ? [
      { label: "Launches recorded", value: "0" },
      { label: "Attempts completed", value: "0" },
      { label: "Grade publishes", value: "0 passed / 0 failed" },
      { label: "Recent active users", value: "0" },
    ]
    : summarizePilotUsage(detail.pilotUsage);

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Pilot usage</p>
        <h2>Basic activity from durable evidence</h2>
        <p>Counts stay deliberately small: launches, completed attempts, governed grade publishes, and recent active learners for this deployment.</p>
        <div class="facts">
          ${
    pilotUsageFacts
      .map(
        (fact) =>
          `<div class="fact">
              <span class="fact-label">${escapeHtml(fact.label)}</span>
              <span class="fact-value">${escapeHtml(fact.value)}</span>
            </div>`,
      )
      .join("")
  }
        </div>
      </div>
    </section>`;
}

export function renderOperationalEvidenceSection(
  appId: string,
  slot: ManagedDeploymentSlot,
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const diagnostics = detail?.diagnostics ?? [];
  const retryableDiagnostics = diagnostics.filter((item) => item.retryable);
  const internalVerification = detail?.brokerVerification?.internal ?? null;
  const viewedDeploymentLabel = slot.persisted
    ? `${formatLmsLabel(slot.lms)} deployment`
    : `${formatLmsLabel(slot.lms)} slot`;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Operations</p>
        <div class="two-column">
          <div class="stack">
            <h2>Deployment-scoped operational evidence.</h2>
            <p>Use the LMS slot in view first. Open the evidence drawer only when you need install, launch, verification, or failure detail for this ${escapeHtml(viewedDeploymentLabel)}.</p>
          </div>
          <div class="facts">
            ${
    renderActivityFact(
      "Install evidence",
      formatActivityTimestamp(detail?.latestInstallEvidence),
      detail?.latestInstallEvidence?.summary ??
        "No install evidence has been recorded for this deployment yet.",
    )
  }
            ${
    renderActivityFact(
      "Last launch",
      formatActivityTimestamp(detail?.latestLaunch),
      detail?.latestLaunch?.summary ?? "No launch has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Latest internal verification",
      formatBrokerVerificationTimestamp(internalVerification),
      internalVerification?.summary ??
        "No internal verification evidence has been recorded for this deployment yet.",
    )
  }
            ${
    renderActivityFact(
      "Diagnostics",
      diagnostics.length === 0 ? "Clear" : `${diagnostics.length} recorded`,
      retryableDiagnostics.length === 0
        ? "No retry actions are waiting right now."
        : `${retryableDiagnostics.length} retry action${
          retryableDiagnostics.length === 1 ? "" : "s"
        } still need operator follow-up.`,
    )
  }
          </div>
        </div>
        <details>
          <summary>Show install, launch, verification, and diagnostic detail</summary>
          <div class="detail-stack">
            ${renderControlPlaneStatusSection(detail)}
            ${renderBrokerVerificationSection(detail)}
            ${renderPilotUsageSection(detail)}
            ${renderDiagnosticsSection(appId, detail)}
          </div>
        </details>
      </div>
    </section>`;
}

export function renderDiagnosticsSection(
  appId: string,
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const diagnostics = detail?.diagnostics ?? [];
  const retryAttemptId = detail?.retryableGradePublication?.attemptId ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Diagnostics</p>
        <h2>Readable failure evidence</h2>
        <p>Lantern keeps rejected launches, roster verification failures, and AGS publish failures as bounded operator evidence instead of raw protocol dumps.</p>
        ${
    diagnostics.length === 0
      ? `<div class="callout">
              <h3>No diagnostics recorded yet</h3>
              <p>The deployment has not recorded a failed launch, NRPS read, or AGS publish yet.</p>
            </div>`
      : `<div class="table-list">
              ${
        diagnostics
          .map((item) => renderDiagnosticRow(item, appId, retryAttemptId))
          .join("")
      }
            </div>`
  }
      </div>
    </section>`;
}

export function renderBrokerVerificationSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const internalVerification = detail?.brokerVerification?.internal ?? null;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Verification</p>
        <h2>Latest internal verification</h2>
        <p>Internal broker verification stays deployment-scoped here. Official 1EdTech evidence remains on the shared verification page.</p>
        <div class="facts">
          ${
    renderActivityFact(
      "Status",
      describeBrokerVerificationStatus(internalVerification?.status ?? null),
      internalVerification?.summary ??
        "No internal verification evidence has been recorded for this deployment yet.",
    )
  }
          ${
    renderActivityFact(
      "Checked at",
      formatBrokerVerificationTimestamp(internalVerification),
      internalVerification === null
        ? "Record manual or CI proof from /admin/verification when this deployment has been checked."
        : "Lantern keeps this proof scoped to the deployment in view.",
    )
  }
        </div>
        ${
    internalVerification?.evidenceUrl
      ? `<div class="button-row">
              <a class="button-ghost" href="${escapeHtml(internalVerification.evidenceUrl)}">${
        escapeHtml(internalVerification.evidenceUrl)
      }</a>
            </div>`
      : ""
  }
      </div>
    </section>`;
}

function renderActivityFact(
  label: string,
  value: string,
  summary: string,
): string {
  return `<div class="fact">
      <span class="fact-label">${escapeHtml(label)}</span>
      <span class="fact-value">${escapeHtml(value)}</span>
      <p class="micro muted">${escapeHtml(summary)}</p>
    </div>`;
}

function renderDimensionRow(
  label: string,
  dimension: ControlPlaneHealthDimension | null,
): string {
  const status = dimension === null
    ? "Unknown"
    : describeDimensionStatus(dimension.status);
  const summary = dimension?.summary ??
    "No control-plane evidence has been recorded for this dimension yet.";
  const checkedAt =
    dimension?.checkedAt === null || dimension?.checkedAt === undefined
      ? "Not recorded yet"
      : formatDateTime(dimension.checkedAt);

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(label)}</span>
          <span class="chip">${escapeHtml(status)}</span>
        </p>
        <p class="micro muted">${escapeHtml(checkedAt)}</p>
      </div>
      <p class="line-copy">${escapeHtml(summary)}</p>
    </article>`;
}

function renderDiagnosticRow(
  item: ControlPlaneDiagnosticItem,
  appId: string,
  retryAttemptId: string | null,
): string {
  const details = [
    item.code === null ? null : `Code ${item.code}`,
    item.attemptId === null ? null : `Attempt ${item.attemptId}`,
  ].filter((value): value is string => value !== null);
  const retryAction = item.retryable && retryAttemptId !== null
    ? `<form method="post" action="/admin/packages/${
      escapeHtml(
        appId,
      )
    }/deployment/retry-grade-publish" class="stack">
            <input type="hidden" name="attemptId" value="${
      escapeHtml(retryAttemptId)
    }" />
            <div class="button-row">
              <button type="submit" class="button-secondary">Retry grade publish</button>
            </div>
          </form>`
    : "";

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(describeDiagnosticKind(item.kind))}</span>
          <span class="chip">${
    escapeHtml(describeDiagnosticStatus(item))
  }</span>
        </p>
        <p class="micro muted">${
    escapeHtml(formatDateTime(item.occurredAt))
  }</p>
      </div>
      <p class="line-copy">${escapeHtml(item.operatorSummary)}</p>
      ${
    details.length === 0
      ? ""
      : `<p class="micro muted">${escapeHtml(details.join(" · "))}</p>`
  }
      ${retryAction}
    </article>`;
}

function formatActivityTimestamp(
  snapshot: DeploymentActivitySnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.occurredAt);
}

function formatGradePublicationTimestamp(
  snapshot: DeploymentGradePublicationSnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.publishedAt ?? snapshot.updatedAt);
}

function formatBrokerVerificationTimestamp(
  verification: InternalBrokerVerificationStatus | null | undefined,
): string {
  if (verification === null || verification === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(verification.checkedAt);
}

function describeGradePublication(
  snapshot: DeploymentGradePublicationSnapshot,
): string {
  switch (snapshot.status) {
    case "published":
      return "Latest grade publish succeeded.";
    case "pending":
      return "Latest grade publish is still pending.";
    case "failed":
      return "Latest grade publish failed and may need retry.";
  }
}

function describeBrokerVerificationStatus(
  status: InternalBrokerVerificationStatus["status"] | null,
): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "notRun":
    case null:
      return "Not recorded yet";
  }
}

function formatLmsLabel(lms: ManagedDeploymentSlot["lms"]): string {
  switch (lms) {
    case "canvas":
      return "Canvas";
    case "moodle":
      return "Moodle";
    case "sakai":
      return "Sakai";
  }
}

function describeOverallStatus(
  status: ControlPlaneHealthStatus | null,
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs follow-up";
    case "failed":
      return "Failed";
    case "unknown":
    case null:
      return "Not recorded yet";
  }
}

function describeDimensionStatus(status: ControlPlaneHealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs follow-up";
    case "failed":
      return "Failed";
    case "unknown":
      return "Unknown";
  }
}

function describeDiagnosticKind(
  kind: ControlPlaneDiagnosticItem["kind"],
): string {
  switch (kind) {
    case "launch":
      return "Launch";
    case "nrps":
      return "NRPS";
    case "brokerVerification":
      return "Broker verification";
    case "reviewer":
      return "Reviewer";
    case "gradePublication":
      return "AGS publish";
  }
}

function describeDiagnosticStatus(item: ControlPlaneDiagnosticItem): string {
  if (item.retryable) {
    return "Retry available";
  }

  return item.status === "failed" ? "Failed" : "Recorded";
}
