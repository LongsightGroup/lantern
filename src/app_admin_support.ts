import type { Context } from '@hono/hono';
import {
  renderDeploymentsPage as renderAdminDeploymentsPage,
  renderVerificationPage as renderAdminVerificationPage,
} from './admin/control_plane.ts';
import type { VerificationPageSection } from './admin/verification_navigation.ts';
import {
  type DeploymentEditorState,
  renderDeploymentDetailPage,
} from './admin/deployment_detail.ts';
import type { AdminNotice } from './admin/layout.ts';
import { listCanvasEnvironments } from './lti/config.ts';
import { resolveConfiguredPublicOrigin } from './public_origin.ts';
import {
  combineNotices,
  createErrorNotice,
  getCanvasConfigUrlNoticeSafe,
  packageDetailPath,
} from './app_notice_support.ts';
import { loadDeploymentDetailStateSafe } from './app_deployment_support.ts';
import { normalizeOptionalString } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { readEnv } from './platform/env.ts';
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import {
  ACCESSIBILITY_REVIEW_FIELDS,
  type AccessibilityReview,
  type PackageVersionRecord,
  parseAccessibilityReview,
} from './package_review/types.ts';

export async function handleReviewDecision(
  context: Context,
  services: AppServices,
  decision: 'approve' | 'reject',
) {
  const id = Number(context.req.param('id'));

  try {
    const formData = await context.req.formData();
    const reviewNotes = normalizeOptionalString(formData.get('reviewNotes'));
    const accessibilityReview = readAccessibilityReviewForm(formData);
    const repository = services.getRepository();
    const packageVersion = decision === 'approve'
      ? await repository.approvePackageVersion({
        id,
        reviewNotes,
        accessibilityReview,
      })
      : await repository.rejectPackageVersion({
        id,
        reviewNotes,
        accessibilityReview,
      });
    await repository.recordAuditEvent({
      eventType: decision === 'approve' ? 'package.approved' : 'package.rejected',
      actorType: 'user',
      actorId: null,
      deploymentRecordId: null,
      packageVersionId: packageVersion.id,
      attemptId: null,
      lineItemBindingId: null,
      status: 'succeeded',
      summary: decision === 'approve'
        ? 'Approved the reviewed package version.'
        : 'Rejected the reviewed package version.',
      detail: {
        appId: packageVersion.appId,
        version: packageVersion.version,
        reviewNotes,
        accessibilityReview,
      },
      occurredAt: new Date().toISOString(),
    });

    return context.redirect(packageDetailPath(packageVersion.appId, packageVersion.version), 303);
  } catch (error) {
    return await renderPackageDetailError(
      context,
      services,
      id,
      decision === 'approve' ? 'Approval blocked' : 'Rejection blocked',
      error,
    );
  }
}

function readAccessibilityReviewForm(formData: FormData): AccessibilityReview | null {
  const review = Object.fromEntries(
    ACCESSIBILITY_REVIEW_FIELDS.map((field) => [
      field.key,
      normalizeOptionalString(formData.get(field.formName)),
    ]),
  );
  const failureNotes = normalizeOptionalString(formData.get('accessibilityFailureNotes'));
  const exceptionNote = normalizeOptionalString(formData.get('accessibilityExceptionNote'));

  if (
    Object.values(review).every((value) => value === null) &&
    failureNotes === null &&
    exceptionNote === null
  ) {
    return null;
  }

  return parseAccessibilityReview({
    ...review,
    failureNotes,
    exceptionNote,
  });
}

export async function renderInventoryError(
  context: Context,
  services: AppServices,
  title: string,
  error: unknown,
) {
  let versions: PackageVersionRecord[] = [];

  try {
    versions = await services.getRepository().listPackageVersions();
  } catch {
    versions = [];
  }

  return context.html(
    renderPackageIndexPage({
      versions,
      notice: createErrorNotice(title, error),
    }),
    statusForError(error),
  );
}

export async function renderPackagesPage(
  context: Context,
  services: AppServices,
  input: {
    notice?: AdminNotice | null;
    status?: 200 | 400 | 500;
  } = {},
) {
  const versions = await services.getRepository().listPackageVersions();

  return context.html(
    renderPackageIndexPage({
      versions,
      notice: input.notice ?? null,
    }),
    input.status ?? 200,
  );
}

export async function renderDeploymentsPage(
  context: Context,
  services: AppServices,
  input: {
    notice?: AdminNotice | null;
    status?: 200 | 400 | 500;
  } = {},
) {
  const deployments = await services.getOpsRepository().listControlPlaneDeployments();

  return context.html(
    renderAdminDeploymentsPage({
      deployments,
      notice: input.notice ?? null,
    }),
    input.status ?? 200,
  );
}

export async function renderVerificationPage(
  context: Context,
  services: AppServices,
  input: {
    notice?: AdminNotice | null;
    status?: 200 | 400 | 500;
    section?: VerificationPageSection;
  } = {},
) {
  const opsRepository = services.getOpsRepository();
  const deployments = await opsRepository.listControlPlaneDeployments();
  const latestBrokerVerification = await opsRepository.getLatestBrokerVerificationStatus();
  const certificationWorkflowStatuses = await opsRepository.listCertificationWorkflowStatuses();
  const latestOfficialCertificationEvidence = await opsRepository
    .getLatestOfficialCertificationEvidence();
  const ltiProfileSettings = await services.getRepository().getLanternLtiProfileSettings();

  return context.html(
    renderAdminVerificationPage({
      deployments,
      latestBrokerVerification,
      certificationWorkflowStatuses,
      latestOfficialCertificationEvidence,
      ltiProfileSettings,
      notice: input.notice ?? null,
      section: input.section ?? 'checklist',
    }),
    input.status ?? 200,
  );
}

export async function renderPackageDetailError(
  context: Context,
  services: AppServices,
  id: number,
  title: string,
  error: unknown,
) {
  try {
    const repository = services.getRepository();
    const packageVersion = await repository.getPackageVersionById(id);

    if (!packageVersion) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice(title, error),
        }),
        statusForError(error),
      );
    }

    const history = await repository.listPackageVersionsByApp(packageVersion.appId);

    return context.html(
      renderPackageDetailPage({
        packageVersion,
        history,
        notice: createErrorNotice(title, error),
      }),
      statusForError(error),
    );
  } catch {
    return context.html(
      renderPackageIndexPage({
        versions: [],
        notice: createErrorNotice(title, error),
      }),
      statusForError(error),
    );
  }
}

export async function renderDeploymentError(
  context: Context,
  services: AppServices,
  appId: string,
  title: string,
  error: unknown,
  input: {
    selectedLms?: 'canvas' | 'moodle' | 'sakai' | null;
    editorState?: DeploymentEditorState | null;
  } = {},
) {
  try {
    const repository = services.getRepository();
    const history = await repository.listPackageVersionsByApp(appId);

    if (history.length === 0) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice(title, error),
        }),
        statusForError(error),
      );
    }

    const appTitle = history[0]?.title ?? history[0]?.appId ?? 'Package';
    const deployments = await repository.listDeploymentsByApp(appId);
    const appOrigin = resolveConfiguredPublicOrigin({
      requestUrl: context.req.url,
      forwardedHeader: context.req.header('forwarded') ?? null,
      xForwardedHost: context.req.header('x-forwarded-host') ?? null,
      xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
      configuredOrigin: readEnv('APP_ORIGIN', services.env),
    });
    const canvasConfigUrl = getCanvasConfigUrlNoticeSafe(appOrigin);
    const detailState = await loadDeploymentDetailStateSafe(repository, appId, appOrigin);

    return context.html(
      renderDeploymentDetailPage({
        appId,
        appTitle,
        history,
        deployments,
        selectedLms: input.selectedLms ?? null,
        editorState: input.editorState ?? null,
        lanternLtiProfileSettings: detailState.ltiProfileSettings,
        canvasConfigUrl: canvasConfigUrl.url,
        canvasDynamicRegistrationUrl: detailState.canvasDynamicRegistrationUrl,
        moodleDynamicRegistrationUrl: detailState.moodleDynamicRegistrationUrl,
        sakaiDynamicRegistrationUrl: detailState.sakaiDynamicRegistrationUrl,
        supportedCanvasEnvironments: listCanvasEnvironments(),
        notice: input.editorState === undefined || input.editorState === null
          ? combineNotices(canvasConfigUrl.notice, createErrorNotice(title, error))
          : canvasConfigUrl.notice,
      }),
      statusForError(error),
    );
  } catch {
    return context.html(
      renderPackageIndexPage({
        versions: [],
        notice: createErrorNotice(title, error),
      }),
      statusForError(error),
    );
  }
}
