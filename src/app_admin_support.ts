import type { Context } from 'hono';
import type { AdminNotice } from './admin/layout.ts';
import { createErrorNotice, packageDetailPath } from './app_notice_support.ts';
import { normalizeOptionalString } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { adminPageInput } from './admin_auth/page_input.ts';
import { getKernelAdminContext } from './lms_kernel/admin_context.ts';
import { governanceEventBase } from './lms_kernel/governance_events.ts';
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
    const packageVersion =
      decision === 'approve'
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
    const actor = getKernelAdminContext(context);
    await services.getLmsKernelRepository().appendGovernanceEvent(
      governanceEventBase({
        traceId: crypto.randomUUID(),
        eventType: decision === 'approve' ? 'package.approved' : 'package.rejected',
        actorType: 'user',
        actorId: actor.membership.userId,
        institutionId: actor.membership.institutionId,
        appId: packageVersion.appId,
        packageVersionId: packageVersion.id,
        decision: decision === 'approve' ? 'allowed' : 'denied',
        outcome: 'completed',
        occurredAt: new Date().toISOString(),
      }),
    );

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
    renderPackageIndexPage(
      adminPageInput(context, {
        versions,
        notice: createErrorNotice(title, error),
      }),
    ),
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
    renderPackageIndexPage(
      adminPageInput(context, {
        versions,
        notice: input.notice ?? null,
      }),
    ),
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
        renderPackageIndexPage(
          adminPageInput(context, {
            versions: [],
            notice: createErrorNotice(title, error),
          }),
        ),
        statusForError(error),
      );
    }

    const history = await repository.listPackageVersionsByApp(packageVersion.appId);

    return context.html(
      renderPackageDetailPage(
        adminPageInput(context, {
          packageVersion,
          history,
          notice: createErrorNotice(title, error),
        }),
      ),
      statusForError(error),
    );
  } catch {
    return context.html(
      renderPackageIndexPage(
        adminPageInput(context, {
          versions: [],
          notice: createErrorNotice(title, error),
        }),
      ),
      statusForError(error),
    );
  }
}
