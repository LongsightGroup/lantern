import type { PublishFinalScoreInput, PublishFinalScoreResult } from '../lti/services.ts';
import { requestCanvasServiceAccessToken } from '../lti/services.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { publishGovernedGradePublication } from '../runtime/gateway.ts';
import type { RetryableGradePublicationLookup } from './types.ts';

export interface RetryScorePublisher {
  (input: PublishFinalScoreInput): Promise<PublishFinalScoreResult>;
}

export interface RetryAccessTokenRequester {
  (input: { issuer: string; clientId: string; scopes: string[] }): Promise<{ accessToken: string }>;
}

export interface RetryLookupRepository extends Pick<
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
  now?: () => Date;
  requestAccessToken?: RetryAccessTokenRequester;
  publishScore?: RetryScorePublisher;
}): Promise<RetryableGradePublicationLookup> {
  const lookup = await input.repository.getRetryableGradePublicationLookup(input.attemptId);

  if (lookup === null) {
    throw new Error(
      `Retry blocked: Lantern could not find a failed grade publication for attempt ${input.attemptId}.`,
    );
  }

  if (lookup.runtimeSession === null) {
    throw new Error(
      'Retry blocked: Lantern no longer has the attempt-scoped runtime session for this grade publication.',
    );
  }

  if (lookup.runtimeSession.services.ags === null) {
    throw new Error(
      'Retry blocked: the saved runtime session does not include AGS service context.',
    );
  }

  if (lookup.binding === null) {
    throw new Error(
      'Retry blocked: Lantern no longer has the saved Canvas binding for this grade publication.',
    );
  }

  const requestAccessToken = input.requestAccessToken ?? requestCanvasServiceAccessToken;
  const now = input.now ?? (() => new Date());
  const token = await requestAccessToken({
    issuer: lookup.binding.issuer,
    clientId: lookup.binding.clientId,
    scopes: lookup.runtimeSession.services.ags.scope,
  });
  const published = await publishGovernedGradePublication({
    repository: input.repository,
    attemptId: lookup.attemptId,
    publication: lookup.publication,
    accessToken: token.accessToken,
    now,
    ...(input.publishScore === undefined ? {} : { publishScore: input.publishScore }),
  });

  return {
    ...lookup,
    publication: {
      ...lookup.publication,
      status: published.gradePublication.status,
      publishedAt: published.gradePublication.publishedAt,
      updatedAt: published.gradePublication.updatedAt,
      errorCode: published.gradePublication.errorCode,
      errorDetail: published.gradePublication.errorDetail,
    },
  };
}
