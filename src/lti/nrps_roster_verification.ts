import type { AppServices } from '../app_services.ts';
import { requireLtiToolSession } from './lti_tool_session.ts';
import type { LanternLtiToolContext } from './tool_provider.ts';
import type { RuntimeSessionRecord } from './types.ts';

export async function readNrpsMemberCount(input: {
  services: AppServices;
  session: RuntimeSessionRecord;
}): Promise<number> {
  let ltiContext: LanternLtiToolContext | undefined;
  const ltiSession = await requireLtiToolSession({
    getStorage: async () => {
      ltiContext = await input.services.getLtiToolContext();
      return ltiContext.storage;
    },
    ltiToolSessionId: input.session.ltiToolSessionId,
    missingMessage: 'The verified LTI session for roster verification is required.',
    notFoundMessage: 'The verified LTI session for roster verification was not found.',
  });

  if (ltiContext === undefined) {
    throw new Error('The lti-tool context for roster verification was not loaded.');
  }

  const result = await ltiContext.tool.createAdvantage(ltiSession).getMembers({
    followPagination: true,
  });

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data.members.length;
}
