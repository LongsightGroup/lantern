import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
} from "../ops/types.ts";
import {
  aggregatePilotUsage,
  resolveOfficialBrokerVerification,
} from "./control_plane_support.ts";
import {
  renderDeploymentInventorySection,
  renderInventorySummarySection,
  renderPilotUsageSection,
} from "./control_plane_sections.ts";
import {
  renderBrokerVerificationSection,
  renderVerificationUpdateSection,
} from "./control_plane_verification_sections.ts";
import { type AdminNotice, renderAdminLayout } from "./layout.ts";

export function renderDeploymentsPage(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  notice?: AdminNotice | null;
}): string {
  const aggregateUsage = aggregatePilotUsage(input.deployments);

  return renderAdminLayout({
    title: "Lantern Admin Deployments",
    eyebrow: "Deployments",
    heading: "Deployments",
    intro:
      "See each governed deployment, its current health, and the latest pilot evidence without mixing that work into the package library.",
    activePath: "/admin/deployments",
    notice: input.notice ?? null,
    body: `${renderInventorySummarySection(input.deployments)}
    ${renderPilotUsageSection(aggregateUsage)}
    ${renderDeploymentInventorySection(input.deployments)}`,
  });
}

export function renderVerificationPage(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  latestBrokerVerification: BrokerVerificationStatus | null;
  notice?: AdminNotice | null;
}): string {
  const latestOfficialBrokerVerification = resolveOfficialBrokerVerification(
    input.latestBrokerVerification,
  );

  return renderAdminLayout({
    title: "Lantern Admin Verification",
    eyebrow: "Verification",
    heading: "Verification",
    intro:
      "Review deployment-scoped broker proof for each saved deployment. Record internal checks and official 1EdTech evidence without merging them into one global status.",
    activePath: "/admin/verification",
    notice: input.notice ?? null,
    body: `${
      renderBrokerVerificationSection({
        deployments: input.deployments,
        latestOfficialBrokerVerification,
      })
    }
    ${renderVerificationUpdateSection(input.deployments)}`,
  });
}
