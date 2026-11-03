import { type LTISession, type LTIStorage, requireLtiSession } from '@longsightgroup/lti-tool';

export interface LtiSessionStorageContext {
  readonly storage: LTIStorage;
}

export async function requireVerifiedLtiSession(input: {
  storage: LTIStorage;
  sessionId: string | null;
  missingMessage: string;
  notFoundMessage: string;
}): Promise<LTISession> {
  if (input.sessionId === null) {
    throw new Error(input.missingMessage);
  }

  const session = await requireLtiSession({
    storage: input.storage,
    sessionId: input.sessionId,
  });

  if (!session.success) {
    throw new Error(input.notFoundMessage);
  }

  return session.data;
}

export async function requireVerifiedLtiSessionWithContext<
  TContext extends LtiSessionStorageContext,
>(input: {
  getContext: () => Promise<TContext>;
  sessionId: string | null;
  missingMessage: string;
  notFoundMessage: string;
}): Promise<{ context: TContext; session: LTISession }> {
  if (input.sessionId === null) {
    throw new Error(input.missingMessage);
  }

  const context = await input.getContext();
  const session = await requireVerifiedLtiSession({
    storage: context.storage,
    sessionId: input.sessionId,
    missingMessage: input.missingMessage,
    notFoundMessage: input.notFoundMessage,
  });

  return { context, session };
}
