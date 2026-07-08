import type { Context } from '@hono/hono';
import type { LtiLaunchVerificationError } from '@longsightgroup/lti-tool';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { DeploymentRecord } from '../package_review/types.ts';
import type { ResolvedLtiProfile } from './profile.ts';
import { buildResolvedLtiProfileDetail } from './profile_resolution.ts';
import { isLtiBoundaryDenialError } from './lti_boundary_denial.ts';

export async function recordLaunchRejectedAudit(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  context: Context;
  error: unknown;
  deployment?: DeploymentRecord | null;
  ltiProfile?: ResolvedLtiProfile | null;
  summary?: string;
}): Promise<void> {
  const detail = buildRejectedLaunchDetail(input);

  await input.repository.recordAuditEvent({
    eventType: 'launch.rejected',
    actorType: 'platform',
    actorId: null,
    deploymentRecordId: input.deployment?.id ?? null,
    packageVersionId: input.deployment?.enabledPackageVersionId ?? null,
    attemptId: null,
    lineItemBindingId: null,
    status: 'failed',
    summary: input.summary ?? 'Rejected the governed LTI launch before runtime handoff.',
    detail,
    occurredAt: new Date().toISOString(),
  });
}

function buildRejectedLaunchDetail(input: {
  context: Context;
  error: unknown;
  deployment?: DeploymentRecord | null;
  ltiProfile?: ResolvedLtiProfile | null;
}): Record<string, unknown> {
  const base = {
    requestPath: new URL(input.context.req.url).pathname,
    forwardedHost: input.context.req.header('x-forwarded-host') ?? null,
    forwardedProto: input.context.req.header('x-forwarded-proto') ?? null,
  };

  if (isLtiBoundaryDenialError(input.error)) {
    return {
      ...base,
      category: input.error.category,
      code: input.error.code,
      message: input.error.message,
      ...input.error.detail,
      ...(input.deployment === undefined || input.deployment === null ? {} : {
        internalDeploymentSlug: input.deployment.slug,
        issuer: input.deployment.binding?.issuer ?? null,
        clientId: input.deployment.binding?.clientId ?? null,
        deploymentId: input.deployment.binding?.deploymentId ?? null,
      }),
      ...(input.ltiProfile === undefined || input.ltiProfile === null
        ? {}
        : buildResolvedLtiProfileDetail(input.ltiProfile)),
    };
  }

  const verificationError = readVerificationError(input.error);

  if (verificationError !== null) {
    return {
      ...base,
      category: 'specInvalid',
      code: verificationError.code,
      message: verificationError.message,
    };
  }

  return {
    ...base,
    category: 'specInvalid',
    code: 'unknown_launch_error',
    message: input.error instanceof Error ? input.error.message : 'Unknown launch error.',
  };
}

function readVerificationError(error: unknown): LtiLaunchVerificationError | null {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return error as LtiLaunchVerificationError;
  }

  return null;
}
