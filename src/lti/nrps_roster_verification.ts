import type { AppServices } from '../app_services.ts';
import { requireVerifiedLtiSessionWithContext } from './session_boundary.ts';
import type { RuntimeSessionRecord } from './types.ts';

export async function readNrpsMemberCount(input: {
  services: AppServices;
  session: RuntimeSessionRecord;
}): Promise<number> {
  const { context, session } = await requireVerifiedLtiSessionWithContext({
    getContext: () => input.services.getLtiToolContext(),
    sessionId: input.session.ltiToolSessionId,
    missingMessage: 'The verified LTI session for roster verification is required.',
    notFoundMessage: 'The verified LTI session for roster verification was not found.',
  });

  const result = await context.tool.createAdvantage(session).getMembers({
    followPagination: true,
  });

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data.members.length;
}
