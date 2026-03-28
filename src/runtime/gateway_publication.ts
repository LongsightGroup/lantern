import { type AttemptScoreResult } from '../grading/service.ts';
import { publishFinalScore } from '../lti/services.ts';
import {
  LTI_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE,
  type RuntimeSessionRecord,
} from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AttemptRecord, PackageVersionRecord } from '../package_review/types.ts';
import { requireRuntimeDeployment } from './gateway_context.ts';
import { errorMessage } from './gateway_errors.ts';
import {
  ensureLineItemBinding,
  requestAccessToken,
  resolveActivityProgress,
} from './gateway_publication_support.ts';
import type {
  FinalizeAttemptResult,
  GovernedGradePublicationInput,
  GovernedGradePublicationResult,
} from './gateway_types.ts';

export async function publishGovernedGradePublication(
  input: GovernedGradePublicationInput,
): Promise<GovernedGradePublicationResult> {
  const publishScore = input.publishScore ?? publishFinalScore;
  const timestamp = input.now().toISOString();

  try {
    await publishScore({
      accessToken: input.accessToken,
      lineItemUrl: input.publication.lineItemUrl,
      platformUserId: input.publication.platformUserId,
      scoreGiven: input.publication.scoreGiven,
      scoreMaximum: input.publication.scoreMaximum,
      activityProgress: input.publication.activityProgress,
      gradingProgress: 'FullyGraded',
      timestamp,
    });

    return {
      gradePublication: await input.repository.updateGradePublication({
        attemptId: input.attemptId,
        status: 'published',
        updatedAt: timestamp,
        publishedAt: timestamp,
        errorCode: null,
        errorDetail: null,
      }),
      gradePublishedNow: true,
      publishError: null,
    };
  } catch (error) {
    return {
      gradePublication: await input.repository.updateGradePublication({
        attemptId: input.attemptId,
        status: 'failed',
        updatedAt: timestamp,
        publishedAt: null,
        errorCode: 'score_publish_failed',
        errorDetail: {
          message: errorMessage(error),
        },
      }),
      gradePublishedNow: false,
      publishError: {
        code: 'score_publish_failed',
        message: errorMessage(error),
        detail: {
          lineItemUrl: input.publication.lineItemUrl,
        },
      },
    };
  }
}

export async function publishRuntimeAttemptScore(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
  packageVersion: PackageVersionRecord;
  score: AttemptScoreResult;
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

  const accessToken = await requestAccessToken({
    scope: ags.scope,
    binding: deployment.binding,
    lineItemBinding: existingBinding,
  });

  if (typeof accessToken !== 'string') {
    return accessToken;
  }

  const lineItemBinding = await ensureLineItemBinding(existingBinding, accessToken, input);

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

  const gradePublication =
    existingPublication ??
    (await input.repository.createGradePublication({
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
    }));
  const published = await publishGovernedGradePublication({
    repository: input.repository,
    attemptId: input.attempt.attemptId,
    publication: gradePublication,
    accessToken,
    now: input.now,
  });

  return {
    lineItemBinding,
    ...published,
  };
}
