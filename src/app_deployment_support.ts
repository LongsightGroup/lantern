import type { AdminNotice } from './admin/layout.ts';
import {
  buildManagedDeploymentSlots,
  type DeploymentNrpsVerificationSummary,
  getPersistedManagedDeployment,
  getPrimaryManagedDeployment,
  type ManagedDeploymentSlot,
} from './admin/deployment_detail.ts';
import { getCanvasConfigUrlNoticeSafe } from './app_notice_support.ts';
import { requireAppOrigin } from './lti/config.ts';
import { buildCanvasDynamicRegistrationUrl } from './lti/canvas_dynamic_registration.ts';
import { createDynamicRegistrationState } from './lti/dynamic_registration_state.ts';
import { buildMoodleDynamicRegistrationUrl } from './lti/moodle_dynamic_registration.ts';
import { buildSakaiDynamicRegistrationUrl } from './lti/sakai_dynamic_registration.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import type {
  AuditEventRecord,
  DeploymentRecord,
  LanternLtiProfileSettingsRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from './package_review/types.ts';

export interface CanvasConfigUrlState {
  url: string | null;
  notice: AdminNotice | null;
}

export interface DeploymentDetailState {
  history: PackageVersionRecord[];
  appTitle: string;
  deployments: DeploymentRecord[];
  slots: ManagedDeploymentSlot[];
  primaryDeployment: DeploymentRecord | null;
  canvasDeployment: DeploymentRecord | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  ltiProfileSettings: LanternLtiProfileSettingsRecord;
  canvasConfigUrl: CanvasConfigUrlState;
  canvasDynamicRegistrationUrl: string | null;
  moodleDynamicRegistrationUrl: string | null;
  sakaiDynamicRegistrationUrl: string | null;
}

export async function loadDeploymentDetailState(
  repository: PackageReviewRepository,
  appId: string,
  appOrigin?: string,
): Promise<DeploymentDetailState> {
  const history = await repository.listPackageVersionsByApp(appId);

  if (history.length === 0) {
    throw new Error('Import a package version first so Lantern has an exact app to pin.');
  }

  const appTitle = history[0]?.title ?? history[0]?.appId ?? 'Package';
  const deployments = await repository.listDeploymentsByApp(appId);
  const ltiProfileSettings = await repository.getLanternLtiProfileSettings();
  const slots = buildManagedDeploymentSlots({
    appId,
    appTitle,
    deployments,
  });
  const primaryDeployment = getPrimaryManagedDeployment(slots);
  const canvasDeployment = getPersistedManagedDeployment(slots, 'canvas');
  const nrpsVerification =
    canvasDeployment === null
      ? null
      : await getLatestNrpsVerification(repository, canvasDeployment.id);
  const [canvasDynamicRegistrationUrl, moodleDynamicRegistrationUrl, sakaiDynamicRegistrationUrl] =
    await Promise.all([
      getCanvasDynamicRegistrationUrlSafe(repository, appId, appOrigin),
      getMoodleDynamicRegistrationUrlSafe(repository, appId, appOrigin),
      getSakaiDynamicRegistrationUrlSafe(repository, appId, appOrigin),
    ]);

  return {
    history,
    appTitle,
    deployments,
    slots,
    primaryDeployment,
    canvasDeployment,
    nrpsVerification,
    ltiProfileSettings,
    canvasConfigUrl: getCanvasConfigUrlNoticeSafe(appOrigin),
    canvasDynamicRegistrationUrl,
    moodleDynamicRegistrationUrl,
    sakaiDynamicRegistrationUrl,
  };
}

export async function loadDeploymentDetailStateSafe(
  repository: PackageReviewRepository,
  appId: string,
  appOrigin?: string,
): Promise<DeploymentDetailState> {
  try {
    return await loadDeploymentDetailState(repository, appId, appOrigin);
  } catch {
    return {
      history: [],
      appTitle: 'Package',
      deployments: [],
      slots: [],
      primaryDeployment: null,
      canvasDeployment: null,
      nrpsVerification: null,
      ltiProfileSettings: {
        defaultLtiProfile: 'governedCompatibility',
        updatedAt: '',
      },
      canvasConfigUrl: getCanvasConfigUrlNoticeSafe(appOrigin),
      canvasDynamicRegistrationUrl: null,
      moodleDynamicRegistrationUrl: null,
      sakaiDynamicRegistrationUrl: null,
    };
  }
}

async function getCanvasDynamicRegistrationUrlSafe(
  repository: PackageReviewRepository,
  appId: string,
  appOrigin?: string,
): Promise<string | null> {
  try {
    if (appOrigin === undefined) {
      requireAppOrigin();
    }
    const state = await createDynamicRegistrationState({
      repository,
      appId,
      lms: 'canvas',
    });
    return buildCanvasDynamicRegistrationUrl(appId, state.state, appOrigin);
  } catch {
    return null;
  }
}

async function getMoodleDynamicRegistrationUrlSafe(
  repository: PackageReviewRepository,
  appId: string,
  appOrigin?: string,
): Promise<string | null> {
  try {
    if (appOrigin === undefined) {
      requireAppOrigin();
    }
    const state = await createDynamicRegistrationState({
      repository,
      appId,
      lms: 'moodle',
    });
    return buildMoodleDynamicRegistrationUrl(appId, state.state, appOrigin);
  } catch {
    return null;
  }
}

async function getSakaiDynamicRegistrationUrlSafe(
  repository: PackageReviewRepository,
  appId: string,
  appOrigin?: string,
): Promise<string | null> {
  try {
    if (appOrigin === undefined) {
      requireAppOrigin();
    }
    const state = await createDynamicRegistrationState({
      repository,
      appId,
      lms: 'sakai',
    });
    return buildSakaiDynamicRegistrationUrl(appId, state.state, appOrigin);
  } catch {
    return null;
  }
}

export async function getLatestNrpsVerification(
  repository: PackageReviewRepository,
  deploymentRecordId: number,
): Promise<DeploymentNrpsVerificationSummary | null> {
  const events = await repository.listAuditEventsByEventType('deployment.nrps_verified');
  const event = [...events]
    .reverse()
    .find((candidate) => candidate.deploymentRecordId === deploymentRecordId);

  if (!event) {
    return null;
  }

  const memberCount =
    typeof event.detail.memberCount === 'number' ? event.detail.memberCount : null;
  const contextId = typeof event.detail.contextId === 'string' ? event.detail.contextId : null;

  return {
    status: event.status === 'succeeded' ? 'succeeded' : 'failed',
    checkedAt: event.occurredAt,
    contextId,
    memberCount,
  };
}

export async function loadPreviewCapabilityLog(input: {
  repository: PackageReviewRepository;
  packageVersionId: number;
}): Promise<{
  session: PreviewSessionRecord | null;
  evidence: PreviewEvidenceRecord[];
}> {
  const session = await input.repository.getLatestPreviewSessionByPackageVersion(
    input.packageVersionId,
    'adminTestLaunch',
  );

  if (session === null) {
    return {
      session: null,
      evidence: [],
    };
  }

  return {
    session,
    evidence: await input.repository.listPreviewEvidence(session.sessionId),
  };
}

export async function loadPlacementAuditTimeline(
  repository: PackageReviewRepository,
  placement: {
    placementId: string;
    deploymentRecordId: number;
    packageVersionId: number;
  },
): Promise<AuditEventRecord[]> {
  const eventTypes = [
    'deep_linking.request.accepted',
    'deep_linking.placement.created',
    'reviewer.preview_viewed',
  ] as const;

  const groups = await Promise.all(
    eventTypes.map((eventType) => repository.listAuditEventsByEventType(eventType)),
  );

  return groups.flat().filter((event) => {
    if (
      event.deploymentRecordId !== placement.deploymentRecordId ||
      event.packageVersionId !== placement.packageVersionId
    ) {
      return false;
    }

    if (event.eventType === 'deep_linking.request.accepted') {
      return true;
    }

    return event.detail.placementId === placement.placementId;
  });
}
