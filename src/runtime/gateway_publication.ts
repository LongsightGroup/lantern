import { type AttemptScoreResult } from '../grading/service.ts';
import { withAgsLineItemTarget } from '../lti/ags_session.ts';
import { requireLtiToolSession } from '../lti/lti_tool_session.ts';
import type { LanternLtiToolContext } from '../lti/tool_provider.ts';
import type { LTISession } from '@longsightgroup/lti-tool';
import {
  LTI_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE,
  type RuntimeSessionRecord,
} from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AttemptRecord, PackageVersionRecord } from '../package_review/types.ts';
import { requireRuntimeDeployment } from './gateway_context.ts';
import {
  buildFinalGradeLineItemSpec,
  resolveActivityProgress,
} from './gateway_publication_support.ts';
import type { FinalizeAttemptResult } from './gateway_types.ts';

export async function publishRuntimeAttemptScore(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
  packageVersion: PackageVersionRecord;
  score: AttemptScoreResult;
  getLtiToolContext: () => Promise<LanternLtiToolContext>;
  now: () => Date;
}): Promise<
  Pick<
    FinalizeAttemptResult,
    'lineItemBinding' | 'gradePublication' | 'gradePublishedNow' | 'publishError'
  >
> {
  const deployment = await requireRuntimeDeployment(input.repository, input.session);

  if (deployment.binding === null) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'missing_binding',
        message: 'Deployment binding is required before score publish can continue.',
        detail: {
          deploymentSlug: deployment.slug,
        },
      },
    };
  }

  if (input.session.ltiToolSessionId === null) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'lti_session_missing',
        message: 'A verified lti-tool session is required before score publish can continue.',
        detail: {
          attemptId: input.attempt.attemptId,
        },
      },
    };
  }

  const ags = input.session.services.ags;

  if (ags === null) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'missing_ags_context',
        message: 'Launch did not provide AGS service context for this attempt.',
        detail: {
          attemptId: input.attempt.attemptId,
        },
      },
    };
  }

  const existingBinding = await input.repository.getLineItemBinding({
    deploymentRecordId: input.session.deploymentRecordId,
    packageVersionId: input.session.packageVersionId,
    contextId: input.attempt.contextId,
    resourceLinkId: input.attempt.resourceLinkId,
    activityId: input.attempt.activityId,
  });
  const hasScoreScope = ags.scope.includes(LTI_AGS_SCORE_SCOPE);
  const requiresLineitemScope = existingBinding === null && ags.lineitemUrl === null;

  if (!hasScoreScope || (requiresLineitemScope && !ags.scope.includes(LTI_AGS_LINEITEM_SCOPE))) {
    return {
      lineItemBinding: existingBinding,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'missing_ags_scope',
        message: 'Launch did not grant the AGS scopes Lantern needs to publish the final score.',
        detail: {
          scopes: ags.scope,
        },
      },
    };
  }

  return await publishRuntimeAttemptScoreWithLtiTool({
    ...input,
    existingBinding,
  });
}

async function publishRuntimeAttemptScoreWithLtiTool(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
  packageVersion: PackageVersionRecord;
  score: AttemptScoreResult;
  getLtiToolContext: () => Promise<LanternLtiToolContext>;
  existingBinding: Awaited<ReturnType<PackageReviewRepository['getLineItemBinding']>>;
  now: () => Date;
}): Promise<
  Pick<
    FinalizeAttemptResult,
    'lineItemBinding' | 'gradePublication' | 'gradePublishedNow' | 'publishError'
  >
> {
  const ags = input.session.services.ags;

  if (ags === null) {
    return {
      lineItemBinding: input.existingBinding,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'missing_ags_context',
        message: 'Launch did not provide AGS service context for this attempt.',
        detail: {
          attemptId: input.attempt.attemptId,
        },
      },
    };
  }

  const ltiContext = await input.getLtiToolContext();
  let ltiSession: LTISession;

  try {
    ltiSession = await requireLtiToolSession({
      storage: ltiContext.storage,
      ltiToolSessionId: input.session.ltiToolSessionId,
      missingMessage: 'A verified lti-tool session is required before score publish can continue.',
      notFoundMessage: 'The verified LTI session for this runtime attempt was not found.',
    });
  } catch (error) {
    return {
      lineItemBinding: input.existingBinding,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'lti_session_missing',
        message: error instanceof Error
          ? error.message
          : 'The verified LTI session is unavailable.',
        detail: {
          ltiToolSessionId: input.session.ltiToolSessionId,
        },
      },
    };
  }

  const lineItemBinding = input.existingBinding ??
    await createLineItemBindingWithLtiTool({
      ...input,
      ltiContext,
      ltiSession,
    });

  if ('publishError' in lineItemBinding) {
    return lineItemBinding;
  }

  const existingPublication = await input.repository.getGradePublicationByAttemptId(
    input.attempt.attemptId,
  );

  if (existingPublication?.status === 'published') {
    return {
      lineItemBinding,
      gradePublication: existingPublication,
      gradePublishedNow: false,
      publishError: null,
    };
  }

  const gradePublication = existingPublication ??
    await input.repository.createGradePublication({
      attemptId: input.attempt.attemptId,
      lineItemBindingId: lineItemBinding.id,
      lineItemUrl: lineItemBinding.lineItemUrl,
      platformUserId: input.attempt.userId,
      scoreGiven: input.score.scoreGiven,
      scoreMaximum: input.score.scoreMaximum,
      activityProgress: resolveActivityProgress(input.attempt),
      gradingProgress: 'Pending',
      status: 'pending',
      createdAt: input.now().toISOString(),
      updatedAt: input.now().toISOString(),
      publishedAt: null,
      errorCode: null,
      errorDetail: null,
    });
  const scoreSession = withAgsLineItemTarget(ltiSession, lineItemBinding.lineItemUrl);
  const result = await ltiContext.tool.createAdvantage(scoreSession).submitScore({
    userId: gradePublication.platformUserId,
    scoreGiven: gradePublication.scoreGiven,
    scoreMaximum: gradePublication.scoreMaximum,
    activityProgress: gradePublication.activityProgress,
    gradingProgress: 'FullyGraded',
    timestamp: input.now().toISOString(),
  });

  if (!result.success) {
    return {
      lineItemBinding,
      gradePublication: await input.repository.updateGradePublication({
        attemptId: input.attempt.attemptId,
        status: 'failed',
        updatedAt: input.now().toISOString(),
        publishedAt: null,
        errorCode: 'score_publish_failed',
        errorDetail: {
          message: result.error.message,
          code: result.error.code,
          serviceKind: result.error.serviceKind,
          operation: result.error.operation,
        },
      }),
      gradePublishedNow: false,
      publishError: {
        code: 'score_publish_failed',
        message: result.error.message,
        detail: {
          lineItemUrl: lineItemBinding.lineItemUrl,
          serviceKind: result.error.serviceKind,
          operation: result.error.operation,
        },
      },
    };
  }

  return {
    lineItemBinding,
    gradePublication: await input.repository.updateGradePublication({
      attemptId: input.attempt.attemptId,
      status: 'published',
      updatedAt: input.now().toISOString(),
      publishedAt: input.now().toISOString(),
      errorCode: null,
      errorDetail: null,
    }),
    gradePublishedNow: true,
    publishError: null,
  };
}

async function createLineItemBindingWithLtiTool(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
  packageVersion: PackageVersionRecord;
  score: AttemptScoreResult;
  ltiContext: LanternLtiToolContext;
  ltiSession: LTISession;
  now: () => Date;
}): Promise<
  | Awaited<ReturnType<PackageReviewRepository['saveLineItemBinding']>>
  | Pick<
    FinalizeAttemptResult,
    'lineItemBinding' | 'gradePublication' | 'gradePublishedNow' | 'publishError'
  >
> {
  const spec = buildFinalGradeLineItemSpec({
    session: input.session,
    packageVersion: input.packageVersion,
    scoreMaximum: input.score.scoreMaximum,
  });
  const result = await input.ltiContext.tool.createAdvantage(input.ltiSession).findOrCreateLineItem(
    {
      resourceLinkId: input.attempt.resourceLinkId,
      resourceId: spec.resourceId,
      tag: spec.tag,
      create: {
        label: spec.label,
        scoreMaximum: spec.scoreMaximum,
      },
    },
  );

  if (!result.success) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'line_item_failed',
        message: result.error.message,
        detail: {
          attemptId: input.attempt.attemptId,
          serviceKind: result.error.serviceKind,
          operation: result.error.operation,
        },
      },
    };
  }

  return await input.repository.saveLineItemBinding({
    deploymentRecordId: input.session.deploymentRecordId,
    packageVersionId: input.session.packageVersionId,
    contextId: input.attempt.contextId,
    resourceLinkId: input.attempt.resourceLinkId,
    activityId: input.attempt.activityId,
    lineItemsUrl: input.session.services.ags?.lineitemsUrl ?? '',
    lineItemUrl: result.data.id,
    resourceId: result.data.resourceId ?? spec.resourceId,
    tag: result.data.tag ?? spec.tag,
    label: result.data.label,
    scoreMaximum: result.data.scoreMaximum,
    createdAt: input.now().toISOString(),
    updatedAt: input.now().toISOString(),
  });
}
