import { errorMessage } from './app_status_support.ts';
import { buildResolvedLtiProfileDetail } from './lti/profile_resolution.ts';
import type { ResolvedLtiProfile } from './lti/profile.ts';
import type { DeploymentBinding, RuntimeSessionRecord } from './lti/types.ts';
import { LTI_AGS_LINEITEM_SCOPE, LTI_AGS_SCORE_SCOPE } from './lti/types.ts';
import type { LanternLtiToolContext } from './lti/tool_provider.ts';
import type { LTISession } from '@longsightgroup/lti-tool';
import { requireVerifiedLtiSessionWithContext } from './lti/session_boundary.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import type { AttemptRecord, DeploymentRecord } from './package_review/types.ts';
import { buildSmokeVerificationLineItemSpec } from './runtime/gateway_publication_support.ts';
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
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  appTitle: string;
  binding: Extract<DeploymentBinding, { lms: SupportedSmokeLms }>;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
  getLtiToolContext: () => Promise<LanternLtiToolContext>;
  ltiProfile?: ResolvedLtiProfile | null;
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
      message: 'Launch did not provide the grade return access Lantern needs for this check.',
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
      message: 'Launch did not grant the grade return scopes Lantern needs for this check.',
    });
  }

  const ltiSession = await loadSmokeVerificationLtiSession({
    getLtiToolContext: input.getLtiToolContext,
    session: input.session,
  });

  if ('error' in ltiSession) {
    return buildGradeSmokeFailureResult({
      lms: input.binding.lms,
      contextId: input.attempt.contextId,
      attemptId: input.attempt.attemptId,
      agsCapable: true,
      publicationStatus: 'not_attempted',
      lineItemUrl: null,
      code: ltiSession.error.code,
      message: ltiSession.error.message,
    });
  }

  let lineItemUrl: string | null = null;

  try {
    const spec = buildSmokeVerificationLineItemSpec({
      appId: input.session.appId,
      appTitle: input.appTitle,
      lms: input.binding.lms,
    });
    const lineItemResult = await ltiSession.ltiContext.tool.createAdvantage(ltiSession.session)
      .findOrCreateLineItem({
        resourceLinkId: input.attempt.resourceLinkId,
        resourceId: spec.resourceId,
        tag: spec.tag,
        create: {
          label: spec.label,
          scoreMaximum: spec.scoreMaximum,
        },
      });

    if (!lineItemResult.success) {
      throw new Error(lineItemResult.error.message);
    }

    lineItemUrl = lineItemResult.data.id;
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
    const scoreResult = await ltiSession.ltiContext.tool.createAdvantage(ltiSession.session)
      .submitScore(
        {
          userId: input.attempt.userId,
          scoreGiven: 1,
          scoreMaximum: 1,
          activityProgress: 'Completed',
          gradingProgress: 'FullyGraded',
        },
        { lineItemUrl },
      );

    if (!scoreResult.success) {
      throw new Error(scoreResult.error.message);
    }
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
    summary: `${formatGradeSmokeLmsLabel(input.binding.lms)} grade return check passed.`,
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

async function loadSmokeVerificationLtiSession(input: {
  getLtiToolContext: () => Promise<LanternLtiToolContext>;
  session: RuntimeSessionRecord;
}): Promise<
  | {
    ltiContext: LanternLtiToolContext;
    session: LTISession;
  }
  | {
    error: {
      code: string;
      message: string;
    };
  }
> {
  try {
    const loaded = await requireVerifiedLtiSessionWithContext({
      getContext: input.getLtiToolContext,
      sessionId: input.session.ltiToolSessionId,
      missingMessage: 'A verified lti-tool session is required for this grade return check.',
      notFoundMessage: 'The verified LTI session for this grade return check was not found.',
    });

    return { ltiContext: loaded.context, session: loaded.session };
  } catch (error) {
    return {
      error: {
        code: 'lti_session_missing',
        message: errorMessage(error),
      },
    };
  }
}

export async function recordGradeSmokeAuditEvent(
  repository: PackageReviewRepository,
  deployment: DeploymentRecord,
  session: RuntimeSessionRecord,
  result: GradeSmokeVerificationResult,
  ltiProfile: ResolvedLtiProfile | null = null,
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
      ...(ltiProfile === null ? {} : buildResolvedLtiProfileDetail(ltiProfile)),
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
    summary: `${formatGradeSmokeLmsLabel(input.lms)} grade return check failed.`,
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
