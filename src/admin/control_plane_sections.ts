import {
  approvalStatusClass,
  approvalStatusLabel,
} from "../package_review/summary.ts";
import { summarizePilotUsage } from "../ops/service.ts";
import type { ControlPlaneDeploymentInventoryRow } from "../ops/types.ts";
import { escapeHtml } from "./layout.ts";
import {
  describeActivitySnapshot,
  describeEnablementState,
  describeFollowUp,
  describeGradePublicationSnapshot,
  describeHealthLabel,
  healthStatusClass,
} from "./control_plane_support.ts";

export function renderInventorySummarySection(
  deployments: ControlPlaneDeploymentInventoryRow[],
): string {
  const deploymentsNeedingFollowUp = deployments.filter(
    (deployment) => deployment.health.overallStatus !== "healthy",
  ).length;

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Inventory summary</p>
        <h2>Deployment-centric inventory</h2>
        <p>Each row tracks one governed deployment with its current review state, launch readiness, runtime evidence, and operator follow-up.</p>
        <div class="facts">
          <div class="fact">
            <span class="fact-label">Deployments</span>
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
        <h2>Basic pilot usage from durable Phase 3 evidence</h2>
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
        <p class="section-label">Deployment inventory</p>
        <h2>One row per governed deployment</h2>
        ${
    deployments.length === 0
      ? `<div class="callout">
              <h3>No deployments recorded yet</h3>
              <p>Lantern has package history, but the governed deployment inventory is still waiting on the first exact version pin and Canvas binding.</p>
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
  const dossierHref = deployment.enabledPackageVersion === null
    ? `/admin/packages/${encodeURIComponent(deployment.appId)}/deployment`
    : `/admin/packages/${encodeURIComponent(deployment.appId)}/versions/${
      encodeURIComponent(
        deployment.enabledPackageVersion,
      )
    }`;
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
        <a class="button-ghost" href="${
    escapeHtml(dossierHref)
  }">Open dossier</a>
        <a class="button-secondary" href="/admin/packages/${
    encodeURIComponent(
      deployment.appId,
    )
  }/deployment">Open deployment</a>
      </div>
    </div>
    <div class="table-row-meta">
      <span><strong>Owner</strong> ${
    escapeHtml(deployment.ownerId ?? "Not recorded yet")
  }</span>
      <span><strong>Enabled version</strong> ${
    escapeHtml(
      deployment.enabledPackageVersion ?? "Not pinned yet",
    )
  }</span>
      <span><strong>Approval state</strong> ${
    escapeHtml(
      deployment.approvalStatus === null
        ? "Not reviewed"
        : approvalStatusLabel(deployment.approvalStatus),
    )
  }</span>
      <span><strong>Enablement state</strong> ${
    escapeHtml(
      describeEnablementState(deployment),
    )
  }</span>
      <span><strong>Current health</strong> ${
    escapeHtml(
      describeHealthLabel(deployment.health.overallStatus),
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
