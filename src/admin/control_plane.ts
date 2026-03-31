import type {
  BrokerVerificationStatus,
  ControlPlaneDeploymentInventoryRow,
} from "../ops/types.ts";
import type { LanternLtiProfileSettingsRecord } from "../package_review/types.ts";
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
  renderLtiProfileSettingsSection,
  renderVerificationUpdateSection,
} from "./control_plane_verification_sections.ts";
import { type AdminNotice, renderAdminLayout } from "./layout.ts";

export function renderDeploymentsPage(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  notice?: AdminNotice | null;
}): string {
  const aggregateUsage = aggregatePilotUsage(input.deployments);

  return renderAdminLayout({
    title: "Lantern Admin Connections",
    eyebrow: "Connections",
    heading: "Connections",
    intro: "See which app setups are live and which ones need attention.",
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
  ltiProfileSettings?: LanternLtiProfileSettingsRecord | null;
  notice?: AdminNotice | null;
}): string {
  const latestOfficialBrokerVerification = resolveOfficialBrokerVerification(
    input.latestBrokerVerification,
  );

  return renderAdminLayout({
    title: "Lantern Admin Verification",
    eyebrow: "Verification",
    heading: "Verification",
    intro: "See saved checks for each app setup, or add a new one.",
    activePath: "/admin/verification",
    notice: input.notice ?? null,
    body: `${
      renderBrokerVerificationSection({
        deployments: input.deployments,
        latestOfficialBrokerVerification,
      })
    }
    ${renderLtiProfileSettingsSection(input.ltiProfileSettings ?? null)}
    ${renderVerificationUpdateSection(input.deployments)}`,
  });
}
