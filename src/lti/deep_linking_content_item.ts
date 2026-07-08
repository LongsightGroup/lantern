import { createLtiResourceLinkContentItem } from '@longsightgroup/lti-tool';
import { buildCanvasLaunchUrl } from './config.ts';
import {
  buildLtiActivityResourceId,
  type DeepLinkingPresentationDocumentTarget,
  type DeepLinkingResponseContentItem,
  type DeepLinkingSessionRecord,
  LANTERN_PLACEMENT_CUSTOM_KEY,
} from './types.ts';
import type { PackageVersionRecord, ReviewedPlacementRecord } from '../package_review/types.ts';

const FINAL_GRADE_TAG = 'final-grade';

export function buildDeepLinkingResourceLinkContentItem(input: {
  session: DeepLinkingSessionRecord;
  placement: ReviewedPlacementRecord;
  packageVersion: PackageVersionRecord;
  appOrigin?: string;
}): DeepLinkingResponseContentItem {
  const title = buildPlacementTitle(input.placement);
  const baseContentItem = {
    title,
    text: 'Launches one reviewed Lantern activity through the governed broker.',
    url: buildCanvasLaunchUrl(input.appOrigin),
    custom: {
      [LANTERN_PLACEMENT_CUSTOM_KEY]: input.placement.placementId,
    },
    ...buildOptionalPresentation(input.session.acceptPresentationDocumentTargets),
    ...buildOptionalLineItem({
      session: input.session,
      placement: input.placement,
      packageVersion: input.packageVersion,
      title,
    }),
  };
  const validated = createLtiResourceLinkContentItem(baseContentItem);

  return validated;
}

function buildPlacementTitle(placement: ReviewedPlacementRecord): string {
  return placement.contentTitle ?? `${placement.packageTitle} ${placement.packageVersion}`;
}

function buildOptionalLineItem(input: {
  session: DeepLinkingSessionRecord;
  placement: ReviewedPlacementRecord;
  packageVersion: PackageVersionRecord;
  title: string;
}): {
  lineItem?: {
    label: string;
    scoreMaximum: number;
    resourceId: string;
    tag: string;
  };
} {
  if (
    !input.session.acceptLineItem || input.session.placement !== 'assignment_selection' ||
    input.packageVersion.grading.maxScore === null
  ) {
    return {};
  }

  return {
    lineItem: {
      label: input.title,
      scoreMaximum: input.packageVersion.grading.maxScore,
      resourceId: buildReviewedPlacementLineItemResourceId(input.placement),
      tag: FINAL_GRADE_TAG,
    },
  };
}

function buildOptionalPresentation(
  targets: DeepLinkingSessionRecord['acceptPresentationDocumentTargets'],
): {
  presentation?: {
    documentTarget: DeepLinkingPresentationDocumentTarget;
  };
} {
  if (targets.length === 0) {
    return {};
  }

  return {
    presentation: {
      documentTarget: targets.includes('iframe') ? 'iframe' : (targets[0] ?? 'iframe'),
    },
  };
}

export function buildReviewedPlacementLineItemResourceId(
  placement: ReviewedPlacementRecord,
): string {
  return buildLtiActivityResourceId({
    appId: placement.appId,
    packageVersion: placement.packageVersion,
    activityId: placement.activityId,
  });
}
