import { assertEquals } from '@std/assert';
import type { CapabilityGrantRecord, GovernedRuntimeSession } from './types.ts';
import { authorizeRosterRead, requiredRosterCapabilities } from './policy.ts';

const NOW = new Date('2026-07-19T16:00:00.000Z');

Deno.test('roster policy requires the base capability plus separately requested fields', () => {
  assertEquals(requiredRosterCapabilities([]), ['lms.roster.members.read']);
  assertEquals(requiredRosterCapabilities(['email', 'photo']), [
    'lms.roster.members.read',
    'lms.roster.contact.read',
    'lms.roster.profile_photo.read',
  ]);
});

Deno.test('roster policy allows exact-version grants scoped to the current context', () => {
  const result = authorizeRosterRead({
    session: buildSession(),
    grants: [
      buildGrant('members', 'lms.roster.members.read'),
      buildGrant('photo', 'lms.roster.profile_photo.read'),
    ],
    requestedCapabilities: [
      'lms.roster.members.read',
      'lms.roster.profile_photo.read',
    ],
    now: NOW,
  });

  assertEquals(result.allowed, true);
});

Deno.test('roster policy denies a grant from another package version or context', () => {
  const wrongVersion = authorizeRosterRead({
    session: buildSession(),
    grants: [
      { ...buildGrant('members', 'lms.roster.members.read'), packageVersionId: 99 },
    ],
    requestedCapabilities: ['lms.roster.members.read'],
    now: NOW,
  });
  const wrongContext = authorizeRosterRead({
    session: buildSession(),
    grants: [
      {
        ...buildGrant('members', 'lms.roster.members.read'),
        scope: { kind: 'context', lmsContextId: 'context-other' },
      },
    ],
    requestedCapabilities: ['lms.roster.members.read'],
    now: NOW,
  });

  assertEquals(wrongVersion, { allowed: false, reason: 'grant_missing' });
  assertEquals(wrongContext, { allowed: false, reason: 'grant_missing' });
});

Deno.test('roster policy fails closed for missing NRPS claims and expired sessions', () => {
  const missingNrps = authorizeRosterRead({
    session: {
      ...buildSession(),
      nrpsContextMembershipsUrl: null,
    },
    grants: [buildGrant('members', 'lms.roster.members.read')],
    requestedCapabilities: ['lms.roster.members.read'],
    now: NOW,
  });
  const expired = authorizeRosterRead({
    session: {
      ...buildSession(),
      runtimeExpiresAt: '2026-07-19T15:59:59.000Z',
    },
    grants: [buildGrant('members', 'lms.roster.members.read')],
    requestedCapabilities: ['lms.roster.members.read'],
    now: NOW,
  });

  assertEquals(missingNrps, { allowed: false, reason: 'service_unavailable' });
  assertEquals(expired, { allowed: false, reason: 'session_expired' });
});

function buildSession(): GovernedRuntimeSession {
  return {
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    launchTraceId: 'trace-1',
    runtimeExpiresAt: '2026-07-19T17:00:00.000Z',
    institutionId: 'institution-1',
    lmsConnectionId: 'connection-1',
    lmsContextId: 'context-1',
    appInstallationId: 'installation-1',
    appId: 'photo-roster',
    packageVersionId: 1,
    packageVersion: '0.1.0',
    packageCapabilities: [
      'lms.roster.members.read',
      'lms.roster.contact.read',
      'lms.roster.profile_photo.read',
    ],
    actorSubjectId: 'instructor-1',
    actorType: 'instructor',
    ltiToolSessionId: 'lti-session-1',
    nrpsContextMembershipsUrl: 'https://lms.example/nrps/context-1',
    nrpsServiceVersions: ['2.0'],
    connectionStatus: 'active',
    institutionStatus: 'active',
    installationStatus: 'active',
    connectorKind: 'nrps',
  };
}

function buildGrant(
  id: string,
  capability: CapabilityGrantRecord['capability'],
): CapabilityGrantRecord {
  return {
    id,
    institutionId: 'institution-1',
    appInstallationId: 'installation-1',
    packageVersionId: 1,
    capability,
    scope: { kind: 'context', lmsContextId: 'context-1' },
    approvedByUserId: 'admin-1',
    approvedAt: '2026-07-19T15:00:00.000Z',
    revokedByUserId: null,
    revokedAt: null,
  };
}
