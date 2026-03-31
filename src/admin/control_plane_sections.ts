import {
  approvalStatusClass,
  approvalStatusLabel,
} from "../package_review/summary.ts";
import { summarizePilotUsage } from "../ops/service.ts";
import type { ControlPlaneDeploymentInventoryRow } from "../ops/types.ts";
import { escapeHtml } from "./layout.ts";
import {
  describeActivitySnapshot,
  describeFollowUp,
  describeHealthLabel,
  describePrimaryAction,
  healthStatusClass,
} from "./control_plane_support.ts";
import { formatLmsLabel } from "./deployment_detail_ops_labels.ts";

export function renderInventorySummarySection(
  deployments: ControlPlaneDeploymentInventoryRow[],
): string {
  const deploymentsNeedingFollowUp = deployments.filter(
    (deployment) => deployment.health.overallStatus !== "healthy",
  ).length;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Connection summary</p>
        <h2>At a glance</h2>
        <div class="facts">
          <div class="fact">
            <span class="fact-label">Connections</span>
            <span class="fact-value">${
    escapeHtml(String(deployments.length))
  }</span>
          </div>
          <div class="fact">
            <span class="fact-label">Healthy now</span>
            <span class="fact-value">${
    escapeHtml(
      String(
        deployments.filter((deployment) =>
          deployment.health.overallStatus === "healthy"
        )
          .length,
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
    </section>`;
}

export function renderPilotUsageSection(
  aggregateUsage: ControlPlaneDeploymentInventoryRow["pilotUsage"],
): string {
  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Pilot usage</p>
        <h2>Recent usage</h2>
        <div class="facts">
          ${
    summarizePilotUsage(aggregateUsage)
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

export function renderDeploymentInventorySection(
  deployments: ControlPlaneDeploymentInventoryRow[],
): string {
  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Connections</p>
        <h2>All connections</h2>
        ${
    deployments.length === 0
      ? `<div class="callout">
              <h3>No connections recorded yet</h3>
              <p>Lantern has package history, but no reviewed tool has been connected to an LMS yet.</p>
            </div>`
      : `<div class="table-list">
              ${deployments.map(renderDeploymentRow).join("")}
            </div>`
  }
      </div>
    </section>`;
}

function renderDeploymentRow(
  deployment: ControlPlaneDeploymentInventoryRow,
): string {
  const activityQuery = deployment.binding?.lms
    ? `?lms=${encodeURIComponent(deployment.binding.lms)}&view=activity`
    : "?view=activity";
  const settingsHref = `/admin/packages/${
    encodeURIComponent(deployment.appId)
  }/deployment`;
  const activityHref = `/admin/packages/${
    encodeURIComponent(
      deployment.appId,
    )
  }/deployment${activityQuery}#activity-details`;
  const primaryAction = describePrimaryAction(deployment);
  const actionMarkup = primaryAction.hrefType === "activity"
    ? `<a class="button-ghost" href="${
      escapeHtml(settingsHref)
    }">Open settings</a>
        <a class="button-secondary" href="${escapeHtml(activityHref)}">${
      escapeHtml(
        primaryAction.label,
      )
    }</a>`
    : primaryAction.label === "Open settings"
    ? `<a class="button-ghost" href="${
      escapeHtml(activityHref)
    }">View launches and problems</a>
        <a class="button-secondary" href="${escapeHtml(settingsHref)}">${
      escapeHtml(
        primaryAction.label,
      )
    }</a>`
    : `<a class="button-secondary" href="${escapeHtml(settingsHref)}">${
      escapeHtml(
        primaryAction.label,
      )
    }</a>`;
  const healthClass = healthStatusClass(deployment.health.overallStatus);
  const approvalMarkup = deployment.approvalStatus === null
    ? `<span class="status-badge status-pending">Not reviewed</span>`
    : `<span class="${
      escapeHtml(
        approvalStatusClass(deployment.approvalStatus),
      )
    }">${escapeHtml(approvalStatusLabel(deployment.approvalStatus))}</span>`;

  return `<article class="table-row">
    <div class="table-row-top">
      <div class="stack">
        <p class="line-title">
          <span>${escapeHtml(deployment.deploymentLabel)}</span>
          <span class="${escapeHtml(healthClass)}">${
    escapeHtml(
      describeHealthLabel(deployment.health.overallStatus),
    )
  }</span>
          ${approvalMarkup}
        </p>
        <p class="line-copy">${escapeHtml(deployment.health.summary)}</p>
      </div>
      <div class="button-row">
        ${actionMarkup}
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>LMS</strong> ${
    escapeHtml(
      deployment.binding === null
        ? "Not connected yet"
        : formatLmsLabel(deployment.binding.lms),
    )
  }</span>
      <span><strong>Recent people</strong> ${
    escapeHtml(
      String(deployment.pilotUsage.recentActiveUsers),
    )
  }</span>
      <span><strong>Live version</strong> ${
    escapeHtml(
      deployment.enabledPackageVersion ?? "Not pinned yet",
    )
  }</span>
      <span><strong>Latest launch</strong> ${
    escapeHtml(
      describeActivitySnapshot(
        deployment.lastLaunchStatus,
        deployment.lastLaunchAt,
      ),
    )
  }</span>
      <span><strong>Next step</strong> ${
    escapeHtml(describeFollowUp(deployment))
  }</span>
    </div>
  </article>`;
}
