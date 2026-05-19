import { type AttemptScoreResult } from '../grading/service.ts';
import {
  ensureLineItem,
  type EnsureLineItemInput,
  type EnsureLineItemResult,
  requestServiceAccessToken,
} from '../lti/services.ts';
import type { EnvReader } from '../platform/env.ts';
import {
  buildLtiActivityResourceId,
  type DeploymentBinding,
  type LaunchAssignmentAndGradeServices,
  type LmsType,
  type RuntimeSessionRecord,
} from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  AttemptRecord,
  GradePublicationRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { errorMessage } from './gateway_errors.ts';
import type { FinalizeAttemptResult } from './gateway_types.ts';

export interface ManagedLineItemSpec {
  resourceId: string;
  tag: string;
  label: string;
  scoreMaximum: number;
}

interface EnsureManagedLineItemInput {
  accessToken: string;
  retryUnauthorized?: () => Promise<string>;
  ags: LaunchAssignmentAndGradeServices;
  resourceLinkId: string;
  spec: ManagedLineItemSpec;
  ensureLineItemFn?: (input: EnsureLineItemInput) => Promise<EnsureLineItemResult>;
}

export function buildFinalGradeLineItemSpec(input: {
  session: RuntimeSessionRecord;
  packageVersion: Pick<PackageVersionRecord, 'title'>;
  scoreMaximum: number;
}): ManagedLineItemSpec {
  return {
    resourceId: buildLineItemResourceId(input.session),
    tag: 'final-grade',
    label: `${input.packageVersion.title} Final Grade`,
    scoreMaximum: input.scoreMaximum,
  };
}

export function buildSmokeVerificationLineItemSpec(input: {
  appId: string;
  appTitle: string;
  lms: LmsType;
}): ManagedLineItemSpec {
  return {
    resourceId: `lantern:${input.appId}:${input.lms}:smoke`,
    tag: 'smoke-verification',
    label: `${input.appTitle} Smoke Verification`,
    scoreMaximum: 1,
  };
}

export async function ensureManagedLineItem(
  input: EnsureManagedLineItemInput,
): Promise<EnsureLineItemResult> {
  const ensureLineItemFn = input.ensureLineItemFn ?? ensureLineItem;

  return await ensureLineItemFn({
    accessToken: input.accessToken,
    lineitemsUrl: input.ags.lineitemsUrl,
    lineitemUrl: input.ags.lineitemUrl,
    resourceLinkId: input.resourceLinkId,
    resourceId: input.spec.resourceId,
    tag: input.spec.tag,
    label: input.spec.label,
    scoreMaximum: input.spec.scoreMaximum,
    ...(input.retryUnauthorized === undefined
      ? {}
      : { retryUnauthorized: input.retryUnauthorized }),
  });
}

export async function requestAccessToken(input: {
  scope: string[];
  binding: DeploymentBinding;
  lineItemBinding: Awaited<ReturnType<PackageReviewRepository['getLineItemBinding']>>;
  env: EnvReader;
  requestToken?: typeof requestServiceAccessToken;
}): Promise<
  | string
  | Pick<
    FinalizeAttemptResult,
    'lineItemBinding' | 'gradePublication' | 'gradePublishedNow' | 'publishError'
  >
> {
  try {
    const requestToken = input.requestToken ?? requestServiceAccessToken;
    const token = await requestToken({
      binding: input.binding,
      scopes: input.scope,
      env: input.env,
    });

    return token.accessToken;
  } catch (error) {
    return {
      lineItemBinding: input.lineItemBinding,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'token_request_failed',
        message: errorMessage(error),
        detail: {
          lms: input.binding.lms,
          issuer: input.binding.issuer,
          clientId: input.binding.clientId,
          deploymentId: input.binding.deploymentId,
        },
      },
    };
  }
}

export async function ensureLineItemBinding(
  existingBinding: Awaited<ReturnType<PackageReviewRepository['getLineItemBinding']>>,
  accessToken: string,
  input: {
    repository: PackageReviewRepository;
    session: RuntimeSessionRecord;
    attempt: AttemptRecord;
    packageVersion: PackageVersionRecord;
    score: AttemptScoreResult;
    now: () => Date;
    retryUnauthorized?: () => Promise<string>;
  },
): Promise<
  | Awaited<ReturnType<PackageReviewRepository['saveLineItemBinding']>>
  | Pick<
    FinalizeAttemptResult,
    'lineItemBinding' | 'gradePublication' | 'gradePublishedNow' | 'publishError'
  >
> {
  if (existingBinding !== null) {
    return existingBinding;
  }

  try {
    const ags = input.session.services.ags;

    if (ags === null) {
      throw new Error('Launch did not provide AGS service context for this attempt.');
    }

    const ensuredLineItem = await ensureManagedLineItem({
      accessToken,
      ags,
      resourceLinkId: input.attempt.resourceLinkId,
      spec: buildFinalGradeLineItemSpec({
        session: input.session,
        packageVersion: input.packageVersion,
        scoreMaximum: input.score.scoreMaximum,
      }),
      ...(input.retryUnauthorized === undefined
        ? {}
        : { retryUnauthorized: input.retryUnauthorized }),
    });

    return await input.repository.saveLineItemBinding({
      deploymentRecordId: input.session.deploymentRecordId,
      packageVersionId: input.session.packageVersionId,
      contextId: input.attempt.contextId,
      resourceLinkId: input.attempt.resourceLinkId,
      activityId: input.attempt.activityId,
      lineItemsUrl: ensuredLineItem.lineItemsUrl,
      lineItemUrl: ensuredLineItem.lineItemUrl,
      resourceId: ensuredLineItem.resourceId,
      tag: ensuredLineItem.tag,
      label: ensuredLineItem.label,
      scoreMaximum: ensuredLineItem.scoreMaximum,
      createdAt: input.now().toISOString(),
      updatedAt: input.now().toISOString(),
    });
  } catch (error) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: 'line_item_failed',
        message: errorMessage(error),
        detail: {
          attemptId: input.attempt.attemptId,
        },
      },
    };
  }
}

export function resolveActivityProgress(
  attempt: AttemptRecord,
): GradePublicationRecord['activityProgress'] {
  return attempt.completionState === 'completed' ? 'Completed' : 'InProgress';
}

function buildLineItemResourceId(session: RuntimeSessionRecord): string {
  return buildLtiActivityResourceId({
    appId: session.appId,
    packageVersion: session.packageVersion,
    activityId: session.launch.activityId,
  });
}
