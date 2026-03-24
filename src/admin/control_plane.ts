import {
  approvalStatusClass,
  approvalStatusLabel,
} from "../package_review/summary.ts";
import { summarizePilotUsage } from "../ops/service.ts";
import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
  OfficialCertificationState,
} from "../ops/types.ts";
import {
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from "./layout.ts";

export function renderControlPlanePage(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  latestBrokerVerification: BrokerVerificationStatus | null;
  notice?: AdminNotice | null;
}): string {
  const latestBrokerVerification = resolveBrokerVerification(
    input.latestBrokerVerification,
    input.deployments,
  );
  const aggregateUsage = aggregatePilotUsage(input.deployments);
  const deploymentsNeedingFollowUp =
    input.deployments.filter((deployment) =>
      deployment.health.overallStatus !== "healthy"
    ).length;

  return renderAdminLayout({
    title: "Lantern Admin Packages",
    eyebrow: "Operator control plane",
    heading: "Operator control plane",
    intro:
      "Use the existing packages surface to see what is enabled, what is healthy, and what has fresh pilot evidence without leaving Lantern's governed SSR admin flow.",
    notice: input.notice ?? null,
    body: `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Inventory summary</p>
        <h2>Deployment-centric inventory</h2>
        <p>Each row tracks one governed deployment with its current review state, launch readiness, runtime evidence, and operator follow-up.</p>
        <div class="facts">
          <div class="fact">
            <span class="fact-label">Deployments</span>
            <span class="fact-value">${
      escapeHtml(String(input.deployments.length))
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Healthy now</span>
            <span class="fact-value">${
      escapeHtml(
        String(
          input.deployments.filter((deployment) =>
            deployment.health.overallStatus === "healthy"
          ).length,
        ),
      )
    }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Need follow-up</span>
            <span class="fact-value">${
      escapeHtml(String(deploymentsNeedingFollowUp))
    }</span>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Pilot usage</p>
        <h2>Basic pilot usage from durable Phase 3 evidence</h2>
        <div class="facts">
          ${
      summarizePilotUsage(aggregateUsage).map((fact) =>
        `<div class="fact">
              <span class="fact-label">${escapeHtml(fact.label)}</span>
              <span class="fact-value">${escapeHtml(fact.value)}</span>
            </div>`
      ).join("")
    }
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Broker verification</p>
          <h2>Supported Canvas path</h2>
          <p>Lantern keeps internal proof of the supported broker path separate from any official directory status so operators can see evidence, not marketing shorthand.</p>
          <div class="fact">
            <span class="fact-label">Supported path</span>
            <span class="fact-value">${
      escapeHtml(
        latestBrokerVerification === null
          ? "Canvas LTI 1.3 launch, AGS, and NRPS"
          : describeSupportedPath(latestBrokerVerification.supportedPath),
      )
    }</span>
          </div>
        </div>
        <section class="stack">
          ${renderBrokerVerificationFacts(latestBrokerVerification)}
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Deployment inventory</p>
        <h2>One row per governed deployment</h2>
        ${
      input.deployments.length === 0
        ? `<div class="callout">
              <h3>No deployments recorded yet</h3>
              <p>Lantern has package history, but the governed deployment inventory is still waiting on the first exact version pin and Canvas binding.</p>
            </div>`
        : `<div class="table-list">
              ${input.deployments.map(renderDeploymentRow).join("")}
            </div>`
    }
      </div>
    </section>`,
  });
}

function renderBrokerVerificationFacts(
  verification: BrokerVerificationStatus | null,
): string {
  const internal = verification?.internal ?? null;
  const official = verification?.official ?? {
    state: "notCertified" as OfficialCertificationState,
    checkedAt: null,
    directoryUrl: null,
  };

  return `<div class="fact">
      <span class="fact-label">Internal verification</span>
      <span class="fact-value">${
    escapeHtml(describeBrokerRunStatus(internal?.status ?? "notRun"))
  }</span>
      <p class="micro muted">${
    escapeHtml(
      internal?.summary ??
        "No internal verification evidence has been recorded for the supported broker path yet.",
    )
  }</p>
      <p class="micro muted">${
    escapeHtml(
      internal?.checkedAt === undefined || internal?.checkedAt === null
        ? "Checked at Not recorded yet"
        : `Checked ${formatDateTime(internal.checkedAt)}`,
    )
  }</p>
      ${
    internal?.evidenceUrl
      ? `<a class="button-ghost" href="${escapeHtml(internal.evidenceUrl)}">${
        escapeHtml(internal.evidenceUrl)
      }</a>`
      : ""
  }
    </div>
    <div class="fact">
      <span class="fact-label">Official certification</span>
      <span class="fact-value">${
    escapeHtml(describeOfficialCertificationState(official.state))
  }</span>
      <p class="micro muted">${
    escapeHtml(
      official.checkedAt === null
        ? "Checked at Not recorded yet"
        : `Checked ${formatDateTime(official.checkedAt)}`,
    )
  }</p>
      ${
    official.directoryUrl
      ? `<a class="button-ghost" href="${escapeHtml(official.directoryUrl)}">${
        escapeHtml(official.directoryUrl)
      }</a>`
      : ""
  }
    </div>`;
}

function renderDeploymentRow(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  const dossierHref = deployment.enabledPackageVersion === null
    ? `/admin/packages/${encodeURIComponent(deployment.appId)}/deployment`
    : `/admin/packages/${encodeURIComponent(deployment.appId)}/versions/${
      encodeURIComponent(deployment.enabledPackageVersion)
    }`;
  const healthClass = healthStatusClass(deployment.health.overallStatus);
  const approvalMarkup = deployment.approvalStatus === null
    ? `<span class="status-badge status-pending">Not reviewed</span>`
    : `<span class="${
      escapeHtml(approvalStatusClass(deployment.approvalStatus))
    }">${escapeHtml(approvalStatusLabel(deployment.approvalStatus))}</span>`;

  return `<article class="table-row">
    <div class="table-row-top">
      <div class="stack">
        <p class="line-title">
          <span>${escapeHtml(deployment.deploymentLabel)}</span>
          <span class="${escapeHtml(healthClass)}">${
    escapeHtml(describeHealthLabel(deployment.health.overallStatus))
  }</span>
          ${approvalMarkup}
        </p>
        <p class="line-copy">${escapeHtml(deployment.health.summary)}</p>
      </div>
      <div class="button-row">
        <a class="button-ghost" href="${
    escapeHtml(dossierHref)
  }">Open dossier</a>
        <a class="button-secondary" href="/admin/packages/${
    encodeURIComponent(deployment.appId)
  }/deployment">Open deployment</a>
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Owner</strong> ${
    escapeHtml(deployment.ownerId ?? "Not recorded yet")
  }</span>
      <span><strong>Enabled version</strong> ${
    escapeHtml(deployment.enabledPackageVersion ?? "Not pinned yet")
  }</span>
      <span><strong>Approval state</strong> ${
    escapeHtml(
      deployment.approvalStatus === null
        ? "Not reviewed"
        : approvalStatusLabel(deployment.approvalStatus),
    )
  }</span>
      <span><strong>Enablement state</strong> ${
    escapeHtml(describeEnablementState(deployment))
  }</span>
      <span><strong>Current health</strong> ${
    escapeHtml(describeHealthLabel(deployment.health.overallStatus))
  }</span>
      <span><strong>Latest launch</strong> ${
    escapeHtml(
      describeActivitySnapshot(
        deployment.lastLaunchStatus,
        deployment.lastLaunchAt,
      ),
    )
  }</span>
      <span><strong>Latest AGS write</strong> ${
    escapeHtml(
      describeGradePublicationSnapshot(
        deployment.lastGradePublishStatus,
        deployment.lastGradePublishAt,
      ),
    )
  }</span>
      <span><strong>Latest NRPS read</strong> ${
    escapeHtml(
      describeActivitySnapshot(
        deployment.lastNrpsReadStatus,
        deployment.lastNrpsReadAt,
      ),
    )
  }</span>
      <span><strong>Follow-up</strong> ${
    escapeHtml(describeFollowUp(deployment))
  }</span>
    </div>
  </article>`;
}

function aggregatePilotUsage(
  deployments: ControlPlaneDeploymentInventoryRow[],
) {
  return deployments.reduce<ControlPlaneDeploymentInventoryRow["pilotUsage"]>(
    (summary, deployment) => ({
      deploymentRecordId: 0,
      totalLaunches: summary.totalLaunches +
        deployment.pilotUsage.totalLaunches,
      attemptsStarted: summary.attemptsStarted +
        deployment.pilotUsage.attemptsStarted,
      attemptsCompleted: summary.attemptsCompleted +
        deployment.pilotUsage.attemptsCompleted,
      gradePublishesSucceeded: summary.gradePublishesSucceeded +
        deployment.pilotUsage.gradePublishesSucceeded,
      gradePublishesFailed: summary.gradePublishesFailed +
        deployment.pilotUsage.gradePublishesFailed,
      recentActiveUsers: summary.recentActiveUsers +
        deployment.pilotUsage.recentActiveUsers,
      lastLaunchAt: pickLatestTimestamp(
        summary.lastLaunchAt,
        deployment.pilotUsage.lastLaunchAt,
      ),
      measuredAt: pickLatestTimestamp(
        summary.measuredAt,
        deployment.pilotUsage.measuredAt,
      ) ?? new Date().toISOString(),
    }),
    {
      deploymentRecordId: 0,
      totalLaunches: 0,
      attemptsStarted: 0,
      attemptsCompleted: 0,
      gradePublishesSucceeded: 0,
      gradePublishesFailed: 0,
      recentActiveUsers: 0,
      lastLaunchAt: null,
      measuredAt: new Date().toISOString(),
    },
  );
}

function pickLatestBrokerVerification(
  deployments: ControlPlaneDeploymentInventoryRow[],
): BrokerVerificationStatus | null {
  return deployments
    .map((deployment) => deployment.brokerVerification)
    .filter((candidate): candidate is BrokerVerificationStatus =>
      candidate !== null
    )
    .sort((left, right) =>
      newestVerificationTimestamp(right).localeCompare(
        newestVerificationTimestamp(left),
      )
    )[0] ?? null;
}

function resolveBrokerVerification(
  latestBrokerVerification: BrokerVerificationStatus | null,
  deployments: ControlPlaneDeploymentInventoryRow[],
): BrokerVerificationStatus | null {
  const deploymentVerification = pickLatestBrokerVerification(deployments);

  if (latestBrokerVerification === null) {
    return deploymentVerification;
  }

  if (deploymentVerification === null) {
    return latestBrokerVerification;
  }

  return {
    supportedPath: deploymentVerification.supportedPath,
    internal: deploymentVerification.internal,
    official: latestBrokerVerification.official,
  };
}

function newestVerificationTimestamp(
  verification: BrokerVerificationStatus,
): string {
  return verification.internal?.checkedAt ?? verification.official.checkedAt ??
    "";
}

function pickLatestTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  return left.localeCompare(right) >= 0 ? left : right;
}

function describeSupportedPath(
  supportedPath: BrokerVerificationStatus["supportedPath"],
): string {
  switch (supportedPath) {
    case "canvasLti13LaunchAgsNrps":
      return "Canvas LTI 1.3 launch, AGS, and NRPS";
  }
}

function describeBrokerRunStatus(
  status: "passed" | "failed" | "pending" | "notRun",
): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "notRun":
      return "Not run";
  }
}

function describeOfficialCertificationState(
  state: OfficialCertificationState,
): string {
  switch (state) {
    case "notCertified":
      return "Not certified";
    case "ltiAdvantageCertified":
      return "LTI Advantage Certified";
    case "ltiAdvantageComplete":
      return "LTI Advantage Complete";
  }
}

function describeEnablementState(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  if (
    deployment.enabledPackageVersionId !== null &&
    deployment.binding !== null
  ) {
    return "Launch-ready";
  }

  if (deployment.enabledPackageVersionId !== null) {
    return "Version pinned, binding missing";
  }

  if (deployment.binding !== null) {
    return "Binding saved, version missing";
  }

  return "Needs configuration";
}

function describeActivitySnapshot(
  status: ControlPlaneDeploymentInventoryRow["lastLaunchStatus"],
  occurredAt: string | null,
): string {
  if (status === null || occurredAt === null) {
    return "Not recorded yet";
  }

  return `${describeActivityStatus(status)} at ${formatDateTime(occurredAt)}`;
}

function describeGradePublicationSnapshot(
  status: ControlPlaneDeploymentInventoryRow["lastGradePublishStatus"],
  occurredAt: string | null,
): string {
  if (status === null || occurredAt === null) {
    return "Not recorded yet";
  }

  return `${describeGradePublicationStatus(status)} at ${
    formatDateTime(occurredAt)
  }`;
}

function describeActivityStatus(
  status: NonNullable<ControlPlaneDeploymentInventoryRow["lastLaunchStatus"]>,
): string {
  switch (status) {
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "notRun":
      return "Not run";
  }
}

function describeGradePublicationStatus(
  status: NonNullable<
    ControlPlaneDeploymentInventoryRow["lastGradePublishStatus"]
  >,
): string {
  switch (status) {
    case "published":
      return "Published";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
  }
}

function describeFollowUp(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  if (deployment.lastGradePublishStatus === "failed") {
    return "Retry required";
  }

  if (deployment.health.overallStatus === "healthy") {
    return "None right now";
  }

  if (deployment.health.overallStatus === "failed") {
    return "Blocked";
  }

  if (deployment.health.overallStatus === "attention") {
    return "Operator review";
  }

  return "Awaiting evidence";
}

function healthStatusClass(
  status: ControlPlaneDeploymentInventoryRow["health"]["overallStatus"],
): string {
  switch (status) {
    case "healthy":
      return "status-badge status-approved";
    case "attention":
      return "status-badge status-pending";
    case "failed":
      return "status-badge status-rejected";
    case "unknown":
      return "status-badge status-pending";
  }
}

function describeHealthLabel(
  status: ControlPlaneDeploymentInventoryRow["health"]["overallStatus"],
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs attention";
    case "failed":
      return "Blocked";
    case "unknown":
      return "Not recorded";
  }
}
