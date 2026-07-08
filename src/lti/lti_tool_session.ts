import type { LTISession, LTIStorage } from '@longsightgroup/lti-tool';

export async function requireLtiToolSession(input: {
  storage?: LTIStorage;
  getStorage?: () => LTIStorage | Promise<LTIStorage>;
  ltiToolSessionId: string | null;
  missingMessage: string;
  notFoundMessage: string;
}): Promise<LTISession> {
  if (input.ltiToolSessionId === null) {
    throw new Error(input.missingMessage);
  }

  const storage = input.storage ?? await input.getStorage?.();

  if (storage === undefined) {
    throw new Error('LTI storage is required to load a verified lti-tool session.');
  }

  const session = await storage.getSession(input.ltiToolSessionId);

  if (session === undefined) {
    throw new Error(input.notFoundMessage);
  }

  return session;
}
