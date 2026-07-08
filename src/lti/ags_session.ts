import type { LTISession } from '@longsightgroup/lti-tool';

export function withAgsLineItemTarget(session: LTISession, lineItemUrl: string): LTISession {
  const lineItemsUrl = session.services?.ags?.lineitems;

  return {
    ...session,
    services: {
      ...session.services,
      ags: {
        lineitem: lineItemUrl,
        scopes: session.services?.ags?.scopes ?? [],
        ...(lineItemsUrl === undefined ? {} : { lineitems: lineItemsUrl }),
      },
    },
    isAssignmentAndGradesAvailable: true,
  };
}
