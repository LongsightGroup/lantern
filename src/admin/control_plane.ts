import type {
  BrokerVerificationStatus,
  CertificationWorkflowStatus,
  ControlPlaneDeploymentInventoryRow,
  LatestOfficialCertificationEvidence,
} from '../ops/types.ts';
import type { LanternLtiProfileSettingsRecord } from '../package_review/types.ts';
import { aggregatePilotUsage, resolveOfficialEvidenceDisplay } from './control_plane_support.ts';
import {
  renderDeploymentInventorySection,
  renderInventorySummarySection,
  renderPilotUsageSection,
} from './control_plane_sections.ts';
import {
  renderLtiProfileSettingsSection,
  renderOfficialEvidenceSection,
  renderVerificationChecklistSection,
  renderVerificationSummarySection,
  renderVerificationUpdateSection,
} from './control_plane_verification_sections.ts';
import { type AdminNotice, renderAdminLayout } from './layout.ts';
import {
  renderVerificationPageNav,
  type VerificationPageSection,
} from './verification_navigation.ts';

export function renderDeploymentsPage(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  notice?: AdminNotice | null;
}): string {
  const aggregateUsage = aggregatePilotUsage(input.deployments);

  return renderAdminLayout({
    title: 'Lantern Admin Connections',
    eyebrow: 'Connections',
    heading: 'Connections',
    intro: 'See which app setups are live and which ones need attention.',
    activePath: '/admin/deployments',
    notice: input.notice ?? null,
    body: `${renderInventorySummarySection(input.deployments)}
    ${renderPilotUsageSection(aggregateUsage)}
    ${renderDeploymentInventorySection(input.deployments)}`,
  });
}

export function renderVerificationPage(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  latestBrokerVerification: BrokerVerificationStatus | null;
  certificationWorkflowStatuses?: CertificationWorkflowStatus[];
  latestOfficialCertificationEvidence?: LatestOfficialCertificationEvidence | null;
  ltiProfileSettings?: LanternLtiProfileSettingsRecord | null;
  notice?: AdminNotice | null;
  section?: VerificationPageSection;
}): string {
  const section = input.section ?? 'checklist';
  const officialEvidence = resolveOfficialEvidenceDisplay({
    latestOfficialCertificationEvidence: input.latestOfficialCertificationEvidence ?? null,
    latestBrokerVerification: input.latestBrokerVerification,
  });
  const page = resolveVerificationPageMeta(section);

  return renderAdminLayout({
    title: `Lantern Admin ${page.heading}`,
    eyebrow: 'Verification',
    heading: page.heading,
    intro: page.intro,
    activePath: page.activePath,
    pageNav: renderVerificationPageNav(section),
    notice: input.notice ?? null,
    body: renderVerificationBody({
      deployments: input.deployments,
      certificationWorkflowStatuses: input.certificationWorkflowStatuses ?? [],
      officialEvidence,
      ltiProfileSettings: input.ltiProfileSettings ?? null,
      section,
    }),
  });
}

function renderVerificationBody(input: {
  deployments: ControlPlaneDeploymentInventoryRow[];
  certificationWorkflowStatuses: CertificationWorkflowStatus[];
  officialEvidence: ReturnType<typeof resolveOfficialEvidenceDisplay>;
  ltiProfileSettings: LanternLtiProfileSettingsRecord | null;
  section: VerificationPageSection;
}): string {
  switch (input.section) {
    case 'official':
      return renderOfficialEvidenceSection(input.officialEvidence);
    case 'new':
      return renderVerificationUpdateSection(input.deployments);
    case 'profile':
      return renderLtiProfileSettingsSection(input.ltiProfileSettings);
    case 'checklist':
      return `${
        renderVerificationSummarySection({
          certificationWorkflowStatuses: input.certificationWorkflowStatuses,
          officialEvidence: input.officialEvidence,
          ltiProfileSettings: input.ltiProfileSettings,
        })
      }
      ${
        renderVerificationChecklistSection({
          deployments: input.deployments,
          certificationWorkflowStatuses: input.certificationWorkflowStatuses,
        })
      }`;
  }
}

function resolveVerificationPageMeta(section: VerificationPageSection): {
  heading: string;
  intro: string;
  activePath: string;
} {
  switch (section) {
    case 'official':
      return {
        heading: 'Official evidence',
        intro: 'Track Product Directory claims without mixing them into the internal checklist.',
        activePath: '/admin/verification/official',
      };
    case 'new':
      return {
        heading: 'Add verification result',
        intro: 'Record one internal or official result on a page built for data entry.',
        activePath: '/admin/verification/new',
      };
    case 'profile':
      return {
        heading: 'Lantern default profile',
        intro: 'Set the Lantern-wide LTI baseline without sharing space with checklist work.',
        activePath: '/admin/verification/lti-profile',
      };
    case 'checklist':
      return {
        heading: 'Verification',
        intro:
          'Review one calm checklist, then move into dedicated pages only when you need official evidence, data entry, or Lantern-wide defaults.',
        activePath: '/admin/verification',
      };
  }
}
