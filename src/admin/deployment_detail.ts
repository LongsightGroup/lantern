import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type { ControlPlaneDeploymentDetailSnapshot } from '../ops/types.ts';
import type { DeploymentRecord, PackageVersionRecord } from '../package_review/types.ts';
import {
  renderCanvasInstallSection,
  renderCurrentPinSection,
} from './deployment_detail_release_sections.ts';
import { renderVersionHistorySection } from './deployment_detail_history_section.ts';
import {
  renderControlPlaneStatusSection,
  renderDiagnosticsSection,
  renderPilotUsageSection,
} from './deployment_detail_ops_sections.ts';
import { type AdminNotice, renderAdminLayout } from './layout.ts';

export interface DeploymentNrpsVerificationSummary {
  status: 'succeeded' | 'failed';
  checkedAt: string;
  contextId: string | null;
  memberCount: number | null;
}

export function buildDefaultDeploymentSeed(
  appId: string,
  appTitle: string,
): {
  slug: string;
  label: string;
} {
  return {
    slug: `${appId}-pilot`,
    label: `${appTitle} Pilot Deployment`,
  };
}

export function renderDeploymentDetailPage(input: {
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  deployment: DeploymentRecord | null;
  nrpsVerification?: DeploymentNrpsVerificationSummary | null;
  controlPlaneDetail?: ControlPlaneDeploymentDetailSnapshot | null;
  canvasConfigUrl?: string | null;
  supportedCanvasEnvironments?: CanvasEnvironmentOption[];
  notice?: AdminNotice | null;
}): string {
  const seed = buildDefaultDeploymentSeed(input.appId, input.appTitle);
  const approvedVersions = input.history.filter((version) => version.approvalStatus === 'approved');
  const activeDeployment = input.deployment ?? {
    id: 0,
    slug: seed.slug,
    label: seed.label,
    appId: input.appId,
    enabledPackageVersionId: null,
    enabledPackageVersion: null,
    binding: null,
    updatedAt: input.history[0]?.importedAt ?? new Date().toISOString(),
  };
  const canvasConfigUrl = input.canvasConfigUrl ?? null;
  const nrpsVerification = input.nrpsVerification ?? null;
  const controlPlaneDetail = input.controlPlaneDetail ?? null;
  const supportedCanvasEnvironments = input.supportedCanvasEnvironments ?? [];
  const launchReady =
    activeDeployment.enabledPackageVersionId !== null &&
    activeDeployment.binding !== null &&
    canvasConfigUrl !== null;
  const rosterVerificationHeading =
    nrpsVerification === null
      ? 'Roster access not verified yet'
      : nrpsVerification.status === 'succeeded'
        ? 'Latest roster read succeeded'
        : 'Latest roster read failed';
  const installStatusHeading =
    activeDeployment.binding === null
      ? 'Canvas binding not saved yet'
      : launchReady
        ? 'Launch-ready configuration saved'
        : 'Canvas binding saved, finish release setup';

  return renderAdminLayout({
    title: `${input.appTitle} Deployment`,
    eyebrow: 'Canvas Deployment',
    heading: activeDeployment.label,
    intro:
      'Pin the reviewed version, then wire this deployment into Canvas through one supported LTI 1.3 path. Lantern keeps both the release choice and the Canvas binding explicit.',
    breadcrumbs: [
      { label: 'Packages', href: '/admin/packages' },
      {
        label: input.appTitle,
        href: `/admin/packages/${input.appId}/versions/${input.history[0]?.version ?? ''}`,
      },
      { label: 'Deployment' },
    ],
    notice: input.notice ?? null,
    body: `${renderControlPlaneStatusSection(controlPlaneDetail)}
    ${renderPilotUsageSection(controlPlaneDetail)}
    ${renderDiagnosticsSection(input.appId, controlPlaneDetail)}
    ${renderCurrentPinSection({
      deployment: input.deployment,
      activeDeployment,
      launchReady,
      installStatusHeading,
    })}
    ${renderCanvasInstallSection({
      appId: input.appId,
      activeDeployment,
      nrpsVerification,
      rosterVerificationHeading,
      canvasConfigUrl,
      supportedCanvasEnvironments,
      approvedVersions,
      history: input.history,
    })}
    ${renderVersionHistorySection(input.history, activeDeployment)}`,
  });
}
