import { requireVerifiedLtiSessionWithContext } from '../lti/session_boundary.ts';
import type { LanternLtiToolContext } from '../lti/tool_provider.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { RetryableGradePublicationLookup } from './types.ts';

export interface RetryLookupRepository extends
  Pick<
    PackageReviewRepository,
    'updateGradePublication'
  > {
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
}

export async function retryFailedGradePublication(input: {
  repository: RetryLookupRepository;
  attemptId: string;
  getLtiToolContext: () => Promise<LanternLtiToolContext>;
  now?: () => Date;
}): Promise<RetryableGradePublicationLookup> {
  const lookup = await input.repository.getRetryableGradePublicationLookup(input.attemptId);

  if (lookup === null) {
    throw new Error(
      `Retry blocked: Lantern could not find a failed grade publication for attempt ${input.attemptId}.`,
    );
  }

  const runtimeSession = lookup.runtimeSession;

  if (runtimeSession === null) {
    throw new Error(
      'Retry blocked: Lantern no longer has the attempt-scoped runtime session for this grade publication.',
    );
  }

  const ags = runtimeSession.services.ags;

  if (ags === null) {
    throw new Error(
      'Retry blocked: the saved runtime session does not include AGS service context.',
    );
  }

  const { context, session } = await requireVerifiedLtiSessionWithContext({
    getContext: input.getLtiToolContext,
    sessionId: runtimeSession.ltiToolSessionId,
    missingMessage:
      'Retry blocked: the saved runtime session does not include a verified LTI session.',
    notFoundMessage:
      'Retry blocked: the verified LTI session for this grade publication was not found.',
  });

  const now = input.now ?? (() => new Date());
  const timestamp = now().toISOString();
  const result = await context.tool.createAdvantage(session).submitScore(
    {
      userId: lookup.publication.platformUserId,
      scoreGiven: lookup.publication.scoreGiven,
      scoreMaximum: lookup.publication.scoreMaximum,
      activityProgress: lookup.publication.activityProgress,
      gradingProgress: 'FullyGraded',
      timestamp,
    },
    { lineItemUrl: lookup.publication.lineItemUrl },
  );
  const gradePublication = result.success
    ? await input.repository.updateGradePublication({
      attemptId: lookup.attemptId,
      status: 'published',
      updatedAt: timestamp,
      publishedAt: timestamp,
      errorCode: null,
      errorDetail: null,
    })
    : await input.repository.updateGradePublication({
      attemptId: lookup.attemptId,
      status: 'failed',
      updatedAt: timestamp,
      publishedAt: null,
      errorCode: 'score_publish_failed',
      errorDetail: {
        message: result.error.message,
        code: result.error.code,
        serviceKind: result.error.serviceKind,
        operation: result.error.operation,
      },
    });

  return {
    ...lookup,
    publication: {
      ...lookup.publication,
      status: gradePublication.status,
      publishedAt: gradePublication.publishedAt,
      updatedAt: gradePublication.updatedAt,
      errorCode: gradePublication.errorCode,
      errorDetail: gradePublication.errorDetail,
    },
  };
}
