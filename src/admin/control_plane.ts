import type { BrokerVerificationStatus, ControlPlaneDeploymentInventoryRow } from '../ops/types.ts';
import { aggregatePilotUsage, resolveBrokerVerification } from './control_plane_support.ts';
import {
  renderDeploymentInventorySection,
  renderInventorySummarySection,
  renderPilotUsageSection,
  renderPlacementAuditSection,
} from './control_plane_sections.ts';
import {
  renderBrokerVerificationSection,
  renderVerificationUpdateSection,
} from './control_plane_verification_sections.ts';
import { type AdminNotice, renderAdminLayout } from './layout.ts';

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
    title: 'Lantern Admin Packages',
    eyebrow: 'Operator control plane',
    heading: 'Operator control plane',
    intro:
      "Use the existing packages surface to see what is enabled, what is healthy, and what has fresh pilot evidence without leaving Lantern's governed SSR admin flow.",
    notice: input.notice ?? null,
    body: `${renderInventorySummarySection(input.deployments)}
    ${renderPilotUsageSection(aggregateUsage)}
    ${renderPlacementAuditSection()}
    ${renderBrokerVerificationSection(latestBrokerVerification)}
    ${renderVerificationUpdateSection()}
    ${renderDeploymentInventorySection(input.deployments)}`,
  });
}
