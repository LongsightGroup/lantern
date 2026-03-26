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
  const latestBrokerVerification = resolveBrokerVerification(
    input.latestBrokerVerification,
    input.deployments,
  );

  return renderAdminLayout({
    title: "Lantern Admin Verification",
    eyebrow: "Verification",
    heading: "Verification",
    intro:
      "Keep broker verification evidence separate from package picking and deployment inventory. Record exactly what the latest proof shows.",
    activePath: "/admin/verification",
    notice: input.notice ?? null,
    body: `${renderBrokerVerificationSection(latestBrokerVerification)}
    ${renderVerificationUpdateSection()}`,
  });
}
