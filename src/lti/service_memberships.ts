import {
  createServiceHeaders,
  fetchWithUnauthorizedRetry,
  mapMembership,
  parseNextLink,
  readJsonResponse,
  requireRecord,
  requireTrimmedString,
} from './service_support.ts';

const NRPS_CONTENT_TYPE = 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';

export interface NrpsMembership {
  userId: string | null;
  roles: string[];
  status: string | null;
  name: string | null;
  email: string | null;
}

export async function readContextMemberships(input: {
  accessToken: string;
  retryUnauthorized?: () => Promise<string>;
  contextMembershipsUrl: string;
}): Promise<NrpsMembership[]> {
  const memberships: NrpsMembership[] = [];
  let nextUrl: string | null = requireTrimmedString(
    input.contextMembershipsUrl,
    'Canvas NRPS memberships URL is required.',
  );

  while (nextUrl !== null) {
    const response = await fetchWithUnauthorizedRetry({
      accessToken: input.accessToken,
      ...(input.retryUnauthorized === undefined
        ? {}
        : { retryUnauthorized: input.retryUnauthorized }),
      request: (accessToken) =>
        fetch(nextUrl!, {
          headers: createServiceHeaders({
            Authorization: `Bearer ${accessToken}`,
            Accept: `${NRPS_CONTENT_TYPE}, application/json`,
          }),
        }),
    });
    const payload = await readJsonResponse(response, 'Canvas NRPS memberships read failed.');
    const container = requireRecord(payload, 'Canvas NRPS memberships response must be an object.');
    const members = container.members;

    if (!Array.isArray(members)) {
      throw new TypeError('Canvas NRPS memberships response must include members.');
    }

    memberships.push(...members.map((member, index) => mapMembership(member, index)));
    nextUrl = parseNextLink(response.headers.get('link'));
  }

  return memberships;
}
