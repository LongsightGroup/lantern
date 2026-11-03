import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';
import type { CapabilityGrantRecord, GovernedRuntimeSession } from './types.ts';

export type PrimitiveAuthorizationResult =
  | {
      readonly allowed: true;
      readonly grants: readonly CapabilityGrantRecord[];
    }
  | {
      readonly allowed: false;
      readonly reason:
        | 'session_expired'
        | 'institution_inactive'
        | 'connection_inactive'
        | 'installation_inactive'
        | 'actor_not_authorized'
        | 'service_unavailable'
        | 'manifest_capability_missing'
        | 'grant_missing';
    };

export function authorizeRosterRead(input: {
  readonly session: GovernedRuntimeSession;
  readonly grants: readonly CapabilityGrantRecord[];
  readonly requestedCapabilities: readonly RosterCapability[];
  readonly now: Date;
}): PrimitiveAuthorizationResult {
  if (Date.parse(input.session.runtimeExpiresAt) <= input.now.getTime()) {
    return { allowed: false, reason: 'session_expired' };
  }
  if (input.session.institutionStatus !== 'active') {
    return { allowed: false, reason: 'institution_inactive' };
  }
  if (input.session.connectionStatus !== 'active') {
    return { allowed: false, reason: 'connection_inactive' };
  }
  if (input.session.installationStatus !== 'active') {
    return { allowed: false, reason: 'installation_inactive' };
  }
  if (input.session.actorType !== 'instructor' && input.session.actorType !== 'administrator') {
    return { allowed: false, reason: 'actor_not_authorized' };
  }
  if (
    input.session.connectorKind === 'nrps' &&
    (input.session.nrpsContextMembershipsUrl === null ||
      input.session.nrpsServiceVersions.length === 0)
  ) {
    return { allowed: false, reason: 'service_unavailable' };
  }

  const matchingGrants: CapabilityGrantRecord[] = [];
  for (const capability of input.requestedCapabilities) {
    if (!input.session.packageCapabilities.includes(capability)) {
      return { allowed: false, reason: 'manifest_capability_missing' };
    }

    const grant = input.grants.find(
      (candidate) =>
        candidate.capability === capability &&
        candidate.packageVersionId === input.session.packageVersionId &&
        candidate.revokedAt === null &&
        (candidate.scope.kind === 'institution' ||
          candidate.scope.lmsContextId === input.session.lmsContextId),
    );

    if (grant === undefined) {
      return { allowed: false, reason: 'grant_missing' };
    }
    matchingGrants.push(grant);
  }

  return { allowed: true, grants: matchingGrants };
}

export function requiredRosterCapabilities(
  fields: readonly ('email' | 'photo')[],
): RosterCapability[] {
  const capabilities: RosterCapability[] = ['lms.roster.members.read'];
  if (fields.includes('email')) {
    capabilities.push('lms.roster.contact.read');
  }
  if (fields.includes('photo')) {
    capabilities.push('lms.roster.profile_photo.read');
  }
  return capabilities;
}
