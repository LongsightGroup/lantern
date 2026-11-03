import { test } from 'vite-plus/test';
import { assertEquals } from '@std/assert';
import { createSyntheticRosterConnector } from './connector.ts';
import type { GovernedRuntimeSession } from './types.ts';

test('synthetic roster connector follows the same opaque page seam as NRPS', async () => {
  const connector = createSyntheticRosterConnector();
  const first = await connector.listPage({
    session: buildSyntheticSession(),
    continuation: null,
  });

  assertEquals(first.ok, true);
  if (!first.ok) {
    throw new Error('Expected synthetic roster page.');
  }
  assertEquals(first.page.members.length, 24);
  assertEquals(first.page.members[0]?.roles, ['instructor']);
  assertEquals(first.page.nextContinuation, '24');

  const second = await connector.listPage({
    session: buildSyntheticSession(),
    continuation: first.page.nextContinuation,
  });
  assertEquals(second.ok, true);
  if (second.ok) {
    assertEquals(second.page.members[0]?.providerSubjectId, 'synthetic-user-25');
  }
});

function buildSyntheticSession(): GovernedRuntimeSession {
  return {
    lmsOrigin: 'https://synthetic.lantern.invalid',
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'token',
    launchTraceId: 'trace-1',
    runtimeExpiresAt: '2026-07-19T17:00:00.000Z',
    institutionId: 'institution-1',
    lmsConnectionId: 'synthetic-1',
    lmsContextId: 'context-1',
    appInstallationId: 'installation-1',
    appId: 'photo-roster',
    packageVersionId: 1,
    packageVersion: '0.1.0',
    packageCapabilities: ['lms.roster.members.read'],
    actorSubjectId: 'instructor-1',
    actorType: 'instructor',
    ltiToolSessionId: null,
    nrpsContextMembershipsUrl: null,
    nrpsServiceVersions: [],
    connectionStatus: 'active',
    institutionStatus: 'active',
    installationStatus: 'active',
    connectorKind: 'synthetic',
  };
}
