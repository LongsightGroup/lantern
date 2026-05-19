import type { CanvasEnvironmentOption } from '../lti/config.ts';
import { DEFAULT_LTI_PROFILE_ID } from '../lti/profile.ts';
import type { LmsType } from '../lti/types.ts';
import type { ControlPlaneDeploymentDetailSnapshot } from '../ops/types.ts';
import type {
  DeploymentRecord,
  LanternLtiProfileSettingsRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { renderManagedDeploymentSections } from './deployment_detail_release_sections.ts';
import { renderVersionHistorySection } from './deployment_detail_history_section.ts';
import { renderOperationalEvidenceSection } from './deployment_detail_ops_sections.ts';
import { type AdminNotice, renderAdminLayout } from './layout.ts';
import { renderPackagePageNav } from './package_navigation.ts';

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

export type DeploymentEditorField =
  | 'canvasEnvironment'
  | 'issuer'
  | 'clientId'
  | 'deploymentId'
  | 'authorizationEndpoint'
  | 'accessTokenUrl'
  | 'jwksUrl'
  | 'packageVersionId';

export interface DeploymentEditorState {
  lms: LmsType;
  focusSection: 'install' | 'pin';
  notice: AdminNotice;
  fieldErrors: Partial<Record<DeploymentEditorField, string>>;
  installValues: Partial<Record<DeploymentEditorField, string>>;
  pinPackageVersionId: string | null;
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
    const existing = input.deployments.find(
      (candidate) =>
        candidate.lmsType === lms || candidate.binding?.lms === lms || candidate.slug === seed.slug,
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
        lmsType: lms,
        ltiProfileOverride: null,
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

export function resolveSelectedManagedDeploymentLms(
  slots: ManagedDeploymentSlot[],
  selectedLms: LmsType | null,
): LmsType {
  if (selectedLms !== null && slots.some((slot) => slot.lms === selectedLms)) {
    return selectedLms;
  }

  return slots.find((slot) => slot.persisted)?.lms ?? 'canvas';
}

export function getSelectedManagedDeploymentSlot(
  slots: ManagedDeploymentSlot[],
  selectedLms: LmsType | null,
): ManagedDeploymentSlot {
  return getManagedDeploymentSlot(slots, resolveSelectedManagedDeploymentLms(slots, selectedLms));
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

export function buildEmptyDeploymentRecord(appId: string, appTitle: string): DeploymentRecord {
  return {
    id: 0,
    ...buildDefaultDeploymentSeed(appId, appTitle),
    appId,
    enabledPackageVersionId: null,
    enabledPackageVersion: null,
    lmsType: 'canvas',
    ltiProfileOverride: null,
    binding: null,
    updatedAt: new Date().toISOString(),
  };
}

export function renderDeploymentDetailPage(input: {
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  deployments: DeploymentRecord[];
  selectedLms?: LmsType | null;
  openOperationalEvidence?: boolean;
  editorState?: DeploymentEditorState | null;
  nrpsVerification?: DeploymentNrpsVerificationSummary | null;
  lanternLtiProfileSettings?: LanternLtiProfileSettingsRecord | null;
  controlPlaneDetail?: ControlPlaneDeploymentDetailSnapshot | null;
  canvasConfigUrl?: string | null;
  canvasDynamicRegistrationUrl?: string | null;
  moodleDynamicRegistrationUrl?: string | null;
  sakaiDynamicRegistrationUrl?: string | null;
  supportedCanvasEnvironments?: CanvasEnvironmentOption[];
  notice?: AdminNotice | null;
}): string {
  const slots = buildManagedDeploymentSlots({
    appId: input.appId,
    appTitle: input.appTitle,
    deployments: input.deployments,
  });
  const approvedVersions = input.history.filter((version) => version.approvalStatus === 'approved');
  const selectedSlot = getSelectedManagedDeploymentSlot(slots, input.selectedLms ?? null);
  const lanternLtiProfileSettings = input.lanternLtiProfileSettings ?? {
    defaultLtiProfile: DEFAULT_LTI_PROFILE_ID,
    updatedAt: '',
  };
  const primaryDeployment = getPrimaryManagedDeployment(slots) ??
    buildEmptyDeploymentRecord(input.appId, input.appTitle);
  const canvasConfigUrl = input.canvasConfigUrl ?? null;
  const canvasDynamicRegistrationUrl = input.canvasDynamicRegistrationUrl ?? null;
  const moodleDynamicRegistrationUrl = input.moodleDynamicRegistrationUrl ?? null;
  const sakaiDynamicRegistrationUrl = input.sakaiDynamicRegistrationUrl ?? null;
  const nrpsVerification = input.nrpsVerification ?? null;
  const controlPlaneDetail = input.controlPlaneDetail ?? null;
  const supportedCanvasEnvironments = input.supportedCanvasEnvironments ?? [];

  return renderAdminLayout({
    title: `${input.appTitle} App settings`,
    eyebrow: 'Settings',
    heading: input.appTitle,
    intro: 'Connect this app to one LMS and choose what version people should open.',
    activePath: '/admin/packages',
    breadcrumbs: [
      { label: 'Apps', href: '/admin/packages' },
      {
        label: input.appTitle,
        href: `/admin/packages/${input.appId}`,
      },
      { label: 'Settings' },
    ],
    notice: input.notice ?? null,
    pageNav: renderPackagePageNav({
      appId: input.appId,
      history: input.history,
      currentSection: 'settings',
    }),
    body: `${
      renderManagedDeploymentSections({
        appId: input.appId,
        slots,
        selectedLms: input.selectedLms ?? null,
        editorState: input.editorState ?? null,
        nrpsVerification,
        lanternLtiProfileSettings,
        canvasConfigUrl,
        canvasDynamicRegistrationUrl,
        moodleDynamicRegistrationUrl,
        sakaiDynamicRegistrationUrl,
        supportedCanvasEnvironments,
        approvedVersions,
        history: input.history,
      })
    }
    ${renderVersionHistorySection(input.history, primaryDeployment)}
    ${
      renderOperationalEvidenceSection(
        input.appId,
        selectedSlot,
        controlPlaneDetail,
        input.openOperationalEvidence ?? false,
      )
    }`,
  });
}
