import { errorMessage } from './app_status_support.ts';
import type { DeploymentBinding, RuntimeSessionRecord } from './lti/types.ts';
import { LTI_AGS_LINEITEM_SCOPE, LTI_AGS_SCORE_SCOPE } from './lti/types.ts';
import { publishFinalScore } from './lti/services.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import type { AttemptRecord, DeploymentRecord } from './package_review/types.ts';
import {
  buildSmokeVerificationLineItemSpec,
  ensureManagedLineItem,
  requestAccessToken,
} from './runtime/gateway_publication_support.ts';
import {
  formatGradeSmokeLmsLabel,
  type SupportedSmokeLms,
} from './app_admin_grade_smoke_validation.ts';

export interface GradeSmokeAuditDetail {
  lms: SupportedSmokeLms;
  contextId: string | null;
  agsCapable: boolean;
  publicationStatus: 'succeeded' | 'failed' | 'not_attempted';
  lineItemUrl: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface GradeSmokeVerificationResult {
  status: 'succeeded' | 'failed';
  summary: string;
  attemptId: string;
  detail: GradeSmokeAuditDetail;
}

export async function runGradeSmokeVerification(input: {
  appTitle: string;
  binding: Extract<DeploymentBinding, { lms: SupportedSmokeLms }>;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
}): Promise<GradeSmokeVerificationResult> {
  const ags = input.session.services.ags;

  if (ags === null || ags.lineitemsUrl === null) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: false,
      publicationStatus: 'not_attempted',
      lineItemUrl: null,
      code: 'missing_ags_context',
      message:
        'Launch did not provide the AGS service context Lantern needs for smoke verification.',
    });
  }

  if (!ags.scope.includes(LTI_AGS_SCORE_SCOPE) || !ags.scope.includes(LTI_AGS_LINEITEM_SCOPE)) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: false,
      publicationStatus: 'not_attempted',
      lineItemUrl: null,
      code: 'missing_ags_scope',
      message: 'Launch did not grant the AGS scopes Lantern needs for smoke verification.',
    });
  }

  const accessToken = await requestAccessToken({
    scope: ags.scope,
    binding: input.binding,
    lineItemBinding: null,
  });

  if (typeof accessToken !== 'string') {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: 'not_attempted',
      lineItemUrl: null,
      code: accessToken.publishError?.code ?? 'token_request_failed',
      message:
        accessToken.publishError?.message ??
        'Lantern could not get a service token for smoke verification.',
    });
  }

  let lineItemUrl: string | null = null;

  try {
    const ensuredLineItem = await ensureManagedLineItem({
      accessToken,
      ags: {
        ...ags,
        lineitemUrl: null,
      },
      resourceLinkId: input.attempt.resourceLinkId,
      spec: buildSmokeVerificationLineItemSpec({
        appId: input.session.appId,
        appTitle: input.appTitle,
        lms: input.binding.lms,
      }),
    });

    lineItemUrl = ensuredLineItem.lineItemUrl;
  } catch (error) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: 'not_attempted',
      lineItemUrl: null,
      code: 'line_item_failed',
      message: errorMessage(error),
    });
  }

  try {
    await publishFinalScore({
      accessToken,
      lineItemUrl,
      platformUserId: input.attempt.userId,
      scoreGiven: 1,
      scoreMaximum: 1,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
    });
  } catch (error) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: 'failed',
      lineItemUrl,
      code: 'score_publish_failed',
      message: errorMessage(error),
    });
  }

  return {
    status: 'succeeded',
    summary: `${formatGradeSmokeLmsLabel(input.binding.lms)} AGS smoke verification succeeded.`,
    attemptId: input.attempt.attemptId,
    detail: {
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      agsCapable: true,
      publicationStatus: 'succeeded',
      lineItemUrl,
      error: null,
    },
  };
}

export async function recordGradeSmokeAuditEvent(
  repository: PackageReviewRepository,
  deployment: DeploymentRecord,
  session: RuntimeSessionRecord,
  result: GradeSmokeVerificationResult,
): Promise<void> {
  await repository.recordAuditEvent({
    eventType: 'deployment.ags_smoke_verified',
    actorType: 'system',
    actorId: null,
    deploymentRecordId: deployment.id,
    packageVersionId: deployment.enabledPackageVersionId ?? session.packageVersionId,
    attemptId: result.attemptId,
    lineItemBindingId: null,
    status: result.status,
    summary: result.summary,
    detail: {
      lms: result.detail.lms,
      contextId: result.detail.contextId,
      agsCapable: result.detail.agsCapable,
      publicationStatus: result.detail.publicationStatus,
      lineItemUrl: result.detail.lineItemUrl,
      error: result.detail.error,
    },
    occurredAt: new Date().toISOString(),
  });
}

function buildGradeSmokeFailureResult(input: {
  lms: SupportedSmokeLms;
  contextId: string | null;
  attemptId: string;
  agsCapable: boolean;
  publicationStatus: GradeSmokeAuditDetail['publicationStatus'];
  lineItemUrl: string | null;
  code: string;
  message: string;
}): GradeSmokeVerificationResult {
  return {
    status: 'failed',
    summary: `${formatGradeSmokeLmsLabel(input.lms)} AGS smoke verification failed.`,
    attemptId: input.attemptId,
    detail: {
      lms: input.lms,
      contextId: input.contextId,
      agsCapable: input.agsCapable,
      publicationStatus: input.publicationStatus,
      lineItemUrl: input.lineItemUrl,
      error: {
        code: input.code,
        message: input.message,
      },
    },
  };
}
