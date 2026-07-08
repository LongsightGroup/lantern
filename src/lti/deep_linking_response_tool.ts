import { buildDeepLinkingResourceLinkContentItem } from './deep_linking_content_item.ts';
import type { DeepLinkingSessionRecord } from './types.ts';
import type { LanternLtiToolContext } from './tool_provider.ts';
import type { PackageVersionRecord, ReviewedPlacementRecord } from '../package_review/types.ts';
import { requireVerifiedLtiSession } from './session_boundary.ts';

export async function createDeepLinkingReturnResponseWithLtiTool(input: {
  ltiContext: LanternLtiToolContext;
  session: DeepLinkingSessionRecord;
  placement: ReviewedPlacementRecord;
  packageVersion: PackageVersionRecord;
  appOrigin?: string;
}): Promise<Response> {
  const ltiSession = await requireVerifiedLtiSession({
    storage: input.ltiContext.storage,
    sessionId: input.session.ltiToolSessionId,
    missingMessage: 'Deep Linking return requires a verified lti-tool session.',
    notFoundMessage: 'The verified LTI session for this Deep Linking return was not found.',
  });

  const result = await input.ltiContext.tool.createAdvantage(ltiSession)
    .createDeepLinkingHtmlResponse([
      buildDeepLinkingResourceLinkContentItem({
        session: input.session,
        placement: input.placement,
        packageVersion: input.packageVersion,
        ...(input.appOrigin === undefined ? {} : { appOrigin: input.appOrigin }),
      }),
    ]);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}
