import { getLtiProfileDefinition } from '../lti/profile.ts';
import { resolveLtiProfileForDeployment } from '../lti/profile_resolution.ts';
import type { PublishFinalScoreInput, PublishFinalScoreResult } from '../lti/services.ts';
import { requestCanvasServiceAccessToken } from '../lti/services.ts';
import { recordInteropPathUsed } from '../interop_audit.ts';
import type { EnvReader } from '../platform/env.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { publishGovernedGradePublication } from '../runtime/gateway.ts';
import type { RetryableGradePublicationLookup } from './types.ts';

export interface RetryScorePublisher {
  (input: PublishFinalScoreInput): Promise<PublishFinalScoreResult>;
}

export interface RetryAccessTokenRequester {
  (input: {
    issuer: string;
    clientId: string;
    deploymentId?: string;
    scopes: string[];
    env: EnvReader;
  }): Promise<{ accessToken: string }>;
}

export interface RetryLookupRepository extends
  Pick<
    PackageReviewRepository,
    | 'getDeploymentByBinding'
    | 'getLanternLtiProfileSettings'
    | 'recordAuditEvent'
    | 'updateGradePublication'
  > {
  getRetryableGradePublicationLookup(
    attemptId: string,
  ): Promise<RetryableGradePublicationLookup | null>;
}

export async function retryFailedGradePublication(input: {
  repository: RetryLookupRepository;
  attemptId: string;
  env: EnvReader;
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

  if (lookup.binding === null) {
    throw new Error(
      'Retry blocked: Lantern no longer has the saved Canvas binding for this grade publication.',
    );
  }
  const deployment = await input.repository.getDeploymentByBinding(lookup.binding);

  if (deployment === null || deployment.id !== lookup.deploymentRecordId) {
    throw new Error(
      'Retry blocked: Lantern could not resolve the saved deployment profile for this grade publication.',
    );
  }

  const ltiProfile = await resolveLtiProfileForDeployment({
    repository: input.repository,
    deployment,
  });

  const requestAccessToken = input.requestAccessToken ?? requestCanvasServiceAccessToken;
  const now = input.now ?? (() => new Date());
  const token = await requestAccessToken({
    issuer: lookup.binding.issuer,
    clientId: lookup.binding.clientId,
    deploymentId: lookup.binding.deploymentId,
    scopes: ags.scope,
    env: input.env,
  });
  const retryUnauthorized = getLtiProfileDefinition(ltiProfile.id).behavior
      .retryServiceUnauthorizedOnce
    ? async () => {
      await recordInteropPathUsed({
        repository: input.repository,
        scope: 'service',
        path: 'service_401_retry',
        actorType: 'system',
        deploymentRecordId: runtimeSession.deploymentRecordId,
        packageVersionId: runtimeSession.packageVersionId,
        attemptId: lookup.attemptId,
        summary: 'Lantern retried an LMS service request after a 401.',
        detail: {
          lms: lookup.binding!.lms,
          deploymentSlug: runtimeSession.deploymentSlug,
        },
        ltiProfile,
      });
      const refreshed = await requestAccessToken({
        issuer: lookup.binding!.issuer,
        clientId: lookup.binding!.clientId,
        deploymentId: lookup.binding!.deploymentId,
        scopes: ags.scope,
        env: input.env,
      });

      return refreshed.accessToken;
    }
    : undefined;
  const published = await publishGovernedGradePublication({
    repository: input.repository,
    attemptId: lookup.attemptId,
    publication: lookup.publication,
    accessToken: token.accessToken,
    now,
    ...(retryUnauthorized === undefined ? {} : { retryUnauthorized }),
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
