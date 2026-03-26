import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
} from "../ops/types.ts";
import {
  aggregatePilotUsage,
  resolveBrokerVerification,
} from "./control_plane_support.ts";
import {
  renderDeploymentInventorySection,
  renderInventorySummarySection,
  renderPilotUsageSection,
  renderPlacementAuditSection,
} from "./control_plane_sections.ts";
import {
  renderBrokerVerificationSection,
  renderVerificationUpdateSection,
} from "./control_plane_verification_sections.ts";
import { type AdminNotice, renderAdminLayout } from "./layout.ts";

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

  return renderAdminLayout({
    title: "Lantern Admin Packages",
    eyebrow: "Operator control plane",
    heading: "Operator control plane",
    intro:
      "Use the existing packages surface to see what is enabled, what is healthy, and what has fresh pilot evidence without leaving Lantern's governed admin flow.",
    notice: input.notice ?? null,
    body: `${renderDemoActionSection()}
    ${renderInventorySummarySection(input.deployments)}
    ${renderPilotUsageSection(aggregateUsage)}
    ${renderPlacementAuditSection()}
    ${renderBrokerVerificationSection(latestBrokerVerification)}
    ${renderVerificationUpdateSection()}
    ${renderDeploymentInventorySection(input.deployments)}`,
  });
}

function renderDemoActionSection(): string {
  return `<section class="panel">
    <div class="panel-body two-column">
      <div class="stack">
        <p class="section-label">Demo app</p>
        <h2>Open the Chapter 4 Asteroids dossier</h2>
        <p>Use the same demo action from the intake flow. If the demo package is already present, Lantern reopens the exact dossier instead of re-importing bytes.</p>
      </div>
      <div class="stack">
        <form method="post" action="/admin/packages/import-demo">
          <button type="submit" class="button-secondary">Open the demo dossier</button>
        </form>
        <p class="micro muted">This action is idempotent. Lantern restores the dossier if the database row is missing and the stored snapshot already exists.</p>
      </div>
    </div>
  </section>`;
}
