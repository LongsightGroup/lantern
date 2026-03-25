import { type AttemptScoreResult } from '../grading/service.ts';
import { ensureLineItem, requestCanvasServiceAccessToken } from '../lti/services.ts';
import { buildLtiActivityResourceId, type RuntimeSessionRecord } from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  AttemptRecord,
  GradePublicationRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { errorMessage } from './gateway_errors.ts';
import type { FinalizeAttemptResult } from './gateway_types.ts';

export async function requestAccessToken(input: {
  scope: string[];
  binding: {
    issuer: string;
    clientId: string;
  };
  lineItemBinding: Awaited<ReturnType<PackageReviewRepository['getLineItemBinding']>>;
}): Promise<
  | string
  | Pick<
      FinalizeAttemptResult,
      'lineItemBinding' | 'gradePublication' | 'gradePublishedNow' | 'publishError'
    >
> {
  try {
    const token = await requestCanvasServiceAccessToken({
      issuer: input.binding.issuer,
      clientId: input.binding.clientId,
      scopes: input.scope,
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
          issuer: input.binding.issuer,
          clientId: input.binding.clientId,
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
    const ensuredLineItem = await ensureLineItem({
      accessToken,
      lineitemsUrl: input.session.services.ags?.lineitemsUrl ?? null,
      lineitemUrl: input.session.services.ags?.lineitemUrl ?? null,
      resourceLinkId: input.attempt.resourceLinkId,
      resourceId: buildLineItemResourceId(input.session),
      tag: 'final-grade',
      label: `${input.packageVersion.title} Final Grade`,
      scoreMaximum: input.score.scoreMaximum,
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
