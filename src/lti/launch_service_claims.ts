import { optionalRecordClaim, optionalStringClaim, requireStringClaim } from './claim_support.ts';
import type { LaunchServiceClaims } from './types.ts';

const CLAIM_AGS_ENDPOINT = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
const CLAIM_NRPS_SERVICE = 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice';

export function parseLaunchServiceClaims(payload: Record<string, unknown>): LaunchServiceClaims {
  return {
    ags: parseAgsServiceClaim(
      optionalRecordClaim(
        payload[CLAIM_AGS_ENDPOINT],
        'Launch AGS endpoint claim must be an object when provided.',
      ),
    ),
    nrps: parseNrpsServiceClaim(
      optionalRecordClaim(
        payload[CLAIM_NRPS_SERVICE],
        'Launch namesroleservice claim must be an object when provided.',
      ),
    ),
  };
}

function parseAgsServiceClaim(value: Record<string, unknown> | null): LaunchServiceClaims['ags'] {
  if (value === null) {
    return null;
  }

  return {
    scope: Array.isArray(value.scope)
      ? value.scope
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item !== '')
      : [],
    lineitemsUrl: optionalStringClaim(value.lineitems),
    lineitemUrl: optionalStringClaim(value.lineitem),
  };
}

function parseNrpsServiceClaim(value: Record<string, unknown> | null): LaunchServiceClaims['nrps'] {
  if (value === null) {
    return null;
  }

  const contextMembershipsUrl = requireStringClaim(
    value.context_memberships_url,
    'Launch namesroleservice.context_memberships_url is required.',
  );

  return {
    contextMembershipsUrl,
    serviceVersions: Array.isArray(value.service_versions)
      ? value.service_versions
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item !== '')
      : [],
  };
}
