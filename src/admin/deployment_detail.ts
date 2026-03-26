import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type { LmsType } from '../lti/types.ts';
import type { ControlPlaneDeploymentDetailSnapshot } from '../ops/types.ts';
import type { DeploymentRecord, PackageVersionRecord } from '../package_review/types.ts';
import { renderManagedDeploymentSections } from './deployment_detail_release_sections.ts';
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

export interface ManagedDeploymentSlot {
  lms: LmsType;
  deployment: DeploymentRecord;
  persisted: boolean;
}

export function buildDefaultDeploymentSeed(
  appId: string,
  appTitle: string,
): {
  slug: string;
  label: string;
} {
  return buildManagedDeploymentSeed(appId, appTitle, 'canvas');
}

export function buildManagedDeploymentSeed(
  appId: string,
  appTitle: string,
  lms: LmsType,
): {
  slug: string;
  label: string;
} {
  switch (lms) {
    case 'canvas':
      return {
        slug: `${appId}-pilot`,
        label: `${appTitle} Pilot Deployment`,
      };
    case 'moodle':
      return {
        slug: `${appId}-moodle`,
        label: `${appTitle} Moodle Deployment`,
      };
    case 'sakai':
      return {
        slug: `${appId}-sakai`,
        label: `${appTitle} Sakai Deployment`,
      };
  }
}

export function buildManagedDeploymentSlots(input: {
  appId: string;
  appTitle: string;
  deployments: DeploymentRecord[];
}): ManagedDeploymentSlot[] {
  const orderedLms: LmsType[] = ['canvas', 'moodle', 'sakai'];

  return orderedLms.map((lms) => {
    const seed = buildManagedDeploymentSeed(input.appId, input.appTitle, lms);
    const existing = input.deployments.find((candidate) =>
      candidate.binding?.lms === lms || candidate.slug === seed.slug
    );

    if (existing) {
      return {
        lms,
        deployment: existing,
        persisted: true,
      };
    }

    return {
      lms,
      persisted: false,
      deployment: {
        id: 0,
        slug: seed.slug,
        label: seed.label,
        appId: input.appId,
        enabledPackageVersionId: null,
        enabledPackageVersion: null,
        binding: null,
        updatedAt: new Date().toISOString(),
      },
    };
  });
}

export function getManagedDeploymentSlot(
  slots: ManagedDeploymentSlot[],
  lms: LmsType,
): ManagedDeploymentSlot {
  const slot = slots.find((candidate) => candidate.lms === lms);

  if (!slot) {
    throw new Error(`Managed deployment slot ${lms} is required.`);
  }

  return slot;
}

export function getPrimaryManagedDeployment(
  slots: ManagedDeploymentSlot[],
): DeploymentRecord | null {
  const canvasSlot = slots.find((slot) => slot.lms === 'canvas' && slot.persisted);
  if (canvasSlot) {
    return canvasSlot.deployment;
  }

  return slots.find((slot) => slot.persisted)?.deployment ?? null;
}

export function getPersistedManagedDeployment(
  slots: ManagedDeploymentSlot[],
  lms: LmsType,
): DeploymentRecord | null {
  const slot = getManagedDeploymentSlot(slots, lms);
  return slot.persisted ? slot.deployment : null;
}

export function buildEmptyDeploymentRecord(
  appId: string,
  appTitle: string,
): DeploymentRecord {
  return {
    id: 0,
    ...buildDefaultDeploymentSeed(appId, appTitle),
    appId,
    enabledPackageVersionId: null,
    enabledPackageVersion: null,
    binding: null,
    updatedAt: new Date().toISOString(),
  };
}

export function renderDeploymentDetailPage(input: {
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  deployments: DeploymentRecord[];
  nrpsVerification?: DeploymentNrpsVerificationSummary | null;
  controlPlaneDetail?: ControlPlaneDeploymentDetailSnapshot | null;
  canvasConfigUrl?: string | null;
  supportedCanvasEnvironments?: CanvasEnvironmentOption[];
  notice?: AdminNotice | null;
}): string {
  const slots = buildManagedDeploymentSlots({
    appId: input.appId,
    appTitle: input.appTitle,
    deployments: input.deployments,
  });
  const approvedVersions = input.history.filter((version) => version.approvalStatus === 'approved');
  const primaryDeployment =
    getPrimaryManagedDeployment(slots) ?? buildEmptyDeploymentRecord(input.appId, input.appTitle);
  const canvasConfigUrl = input.canvasConfigUrl ?? null;
  const nrpsVerification = input.nrpsVerification ?? null;
  const controlPlaneDetail = input.controlPlaneDetail ?? null;
  const supportedCanvasEnvironments = input.supportedCanvasEnvironments ?? [];

  return renderAdminLayout({
    title: `${input.appTitle} Deployment`,
    eyebrow: 'Managed LMS deployment',
    heading: `${input.appTitle} Deployment`,
    intro:
      'Review the Canvas, Moodle, and Sakai deployment slots for this reviewed app. Lantern keeps each release pin and exact LMS binding explicit so one install does not overwrite another.',
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
    ${renderManagedDeploymentSections({
      appId: input.appId,
      slots,
      nrpsVerification,
      canvasConfigUrl,
      supportedCanvasEnvironments,
      approvedVersions,
      history: input.history,
    })}
    ${renderVersionHistorySection(input.history, primaryDeployment)}`,
  });
}
