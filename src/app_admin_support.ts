import type { Context } from '@hono/hono';
import {
  renderDeploymentsPage as renderAdminDeploymentsPage,
  renderVerificationPage as renderAdminVerificationPage,
} from './admin/control_plane.ts';
import {
  type DeploymentEditorState,
  renderDeploymentDetailPage,
} from './admin/deployment_detail.ts';
import type { AdminNotice } from './admin/layout.ts';
import { listCanvasEnvironments } from './lti/config.ts';
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
import { renderPackageDetailPage } from './admin/package_detail.ts';
import { renderPackageIndexPage } from './admin/package_index.ts';
import type { PackageVersionRecord } from './package_review/types.ts';

export async function handleReviewDecision(
  context: Context,
  services: AppServices,
  decision: 'approve' | 'reject',
) {
  const id = Number(context.req.param('id'));

  try {
    const formData = await context.req.formData();
    const reviewNotes = normalizeOptionalString(formData.get('reviewNotes'));
    const repository = services.getRepository();
    const packageVersion =
      decision === 'approve'
        ? await repository.approvePackageVersion({ id, reviewNotes })
        : await repository.rejectPackageVersion({ id, reviewNotes });
    await repository.recordAuditEvent({
      eventType: decision === 'approve' ? 'package.approved' : 'package.rejected',
      actorType: 'user',
      actorId: null,
      deploymentRecordId: null,
      packageVersionId: packageVersion.id,
      attemptId: null,
      lineItemBindingId: null,
      status: 'succeeded',
      summary:
        decision === 'approve'
          ? 'Approved the reviewed package version.'
          : 'Rejected the reviewed package version.',
      detail: {
        appId: packageVersion.appId,
        version: packageVersion.version,
        reviewNotes,
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
  } = {},
) {
  const [deployments, latestBrokerVerification] = await Promise.all([
    services.getOpsRepository().listControlPlaneDeployments(),
    services.getOpsRepository().getLatestBrokerVerificationStatus(),
  ]);

  return context.html(
    renderAdminVerificationPage({
      deployments,
      latestBrokerVerification,
      notice: input.notice ?? null,
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
    const canvasConfigUrl = getCanvasConfigUrlNoticeSafe();
    const detailState = await loadDeploymentDetailStateSafe(repository, appId);

    return context.html(
      renderDeploymentDetailPage({
        appId,
        appTitle,
        history,
        deployments,
        selectedLms: input.selectedLms ?? null,
        editorState: input.editorState ?? null,
        canvasConfigUrl: canvasConfigUrl.url,
        canvasDynamicRegistrationUrl: detailState.canvasDynamicRegistrationUrl,
        moodleDynamicRegistrationUrl: detailState.moodleDynamicRegistrationUrl,
        sakaiDynamicRegistrationUrl: detailState.sakaiDynamicRegistrationUrl,
        supportedCanvasEnvironments: listCanvasEnvironments(),
        notice:
          input.editorState === undefined || input.editorState === null
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
