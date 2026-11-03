import { test } from 'vite-plus/test';
import { assert, assertEquals, assertNotEquals, assertStringIncludes } from '@std/assert';
import { createObjectEnvReader } from '../platform/env.ts';
import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';
import type { RosterConnector } from './connector.ts';
import { createGovernedRosterService } from './service.ts';
import {
  buildGovernedSyntheticSession,
  buildKernelGrant,
  MemoryLmsKernelRepository,
} from './repository_memory_test_support.ts';

const NOW = new Date('2026-07-19T16:00:00.000Z');

test('governed roster service returns opaque members, protected media, pagination, and one audit trace', async () => {
  const repository = new MemoryLmsKernelRepository({
    session: buildGovernedSyntheticSession(),
    grants: [
      buildKernelGrant('grant-members', 'lms.roster.members.read'),
      buildKernelGrant('grant-email', 'lms.roster.contact.read'),
      buildKernelGrant('grant-photo', 'lms.roster.profile_photo.read'),
    ],
  });
  const ids = idSequence();
  const service = createGovernedRosterService({
    repository,
    nrpsConnector: unavailableConnector(),
    syntheticConnector: pagedConnector(),
    env: testEnv(),
    publicOrigin: 'https://runtime.lantern.example',
    createId: ids,
    now: () => NOW,
  });

  const first = await service.listRoster({
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    request: { fields: ['email', 'photo'] },
  });

  assert(first.ok);
  assertEquals(first.value.members.length, 1);
  const member = first.value.members[0]!;
  assertNotEquals(member.subjectId, 'provider-user-1');
  assertEquals(member.displayName, 'Avery Learner');
  assertEquals(member.email, 'avery@example.edu');
  assert(member.photo !== undefined);
  assertStringIncludes(member.photo.url, 'https://runtime.lantern.example/runtime/media/');
  assert(first.value.nextCursor !== undefined);
  assertEquals(first.value.nextCursor.includes('opaque-next-url'), false);
  assertEquals(repository.events.length, 4);
  assertEquals(new Set(repository.events.map((event) => event.traceId)).size, 1);
  assertEquals(repository.events.at(-1)?.objectCount, 1);
  const ledger = JSON.stringify(repository.events);
  assertEquals(ledger.includes('Avery Learner'), false);
  assertEquals(ledger.includes('avery@example.edu'), false);
  assertEquals(ledger.includes('provider-user-1'), false);
  assertEquals(ledger.includes('profile.example'), false);

  const second = await service.listRoster({
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    request: {
      fields: ['email', 'photo'],
      cursor: first.value.nextCursor,
    },
  });
  assert(second.ok);
  assertEquals(second.value.members[0]?.displayName, 'Jordan Learner');
  assertEquals(second.value.nextCursor, undefined);
});

test('governed roster service rejects a binding from another immutable app version', async () => {
  const repository = new MemoryLmsKernelRepository({
    session: buildGovernedSyntheticSession(),
    grants: [buildKernelGrant('grant-members', 'lms.roster.members.read')],
  });
  let connectorCalled = false;
  const connector: RosterConnector = {
    listPage() {
      connectorCalled = true;
      return Promise.resolve({
        ok: true,
        page: { members: [], nextContinuation: null },
      });
    },
  };
  const service = createGovernedRosterService({
    repository,
    nrpsConnector: connector,
    syntheticConnector: connector,
    env: testEnv(),
    publicOrigin: 'https://runtime.lantern.example',
    createId: idSequence(),
    now: () => NOW,
  });

  const result = await service.listRoster({
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    bindingIdentity: { appId: 'photo-roster', packageVersionId: 99 },
    request: { fields: [] },
  });

  assertEquals(result.ok, false);
  assertEquals(connectorCalled, false);
});

test('governed roster service denies the complete request after photo permission is revoked', async () => {
  const repository = new MemoryLmsKernelRepository({
    session: buildGovernedSyntheticSession(),
    grants: [
      buildKernelGrant('grant-members', 'lms.roster.members.read'),
      {
        ...buildKernelGrant('grant-photo', 'lms.roster.profile_photo.read'),
        revokedByUserId: 'admin-1',
        revokedAt: '2026-07-19T15:30:00.000Z',
      },
    ],
  });
  let connectorCalled = false;
  const connector: RosterConnector = {
    listPage() {
      connectorCalled = true;
      return Promise.resolve({
        ok: true,
        page: { members: [], nextContinuation: null },
      });
    },
  };
  const service = createGovernedRosterService({
    repository,
    nrpsConnector: connector,
    syntheticConnector: connector,
    env: testEnv(),
    publicOrigin: 'https://runtime.lantern.example',
    createId: idSequence(),
    now: () => NOW,
  });

  const result = await service.listRoster({
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    request: { fields: ['photo'] },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, 'permission_denied');
  }
  assertEquals(connectorCalled, false);
  assertEquals(
    repository.events.map((event) => event.decision),
    ['denied', 'denied'],
  );
});

test('governed roster service rejects a cursor replayed by another package version', async () => {
  const repository = new MemoryLmsKernelRepository({
    session: buildGovernedSyntheticSession(),
    grants: [buildKernelGrant('grant-members', 'lms.roster.members.read')],
  });
  const service = createGovernedRosterService({
    repository,
    nrpsConnector: unavailableConnector(),
    syntheticConnector: pagedConnector(),
    env: testEnv(),
    publicOrigin: 'https://runtime.lantern.example',
    createId: idSequence(),
    now: () => NOW,
  });
  const first = await service.listRoster({
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    request: { fields: [] },
  });
  assert(first.ok);
  assert(first.value.nextCursor !== undefined);

  repository.session = {
    ...buildGovernedSyntheticSession(),
    packageVersionId: 2,
  };
  repository.grants[0] = {
    ...repository.grants[0]!,
    packageVersionId: 2,
  };
  const replay = await service.listRoster({
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    request: { fields: [], cursor: first.value.nextCursor },
  });

  assertEquals(replay.ok, false);
  if (!replay.ok) {
    assertEquals(replay.error.code, 'invalid_request');
  }
});

function pagedConnector(): RosterConnector {
  return {
    listPage(input) {
      const second = input.continuation === 'opaque-next-url';
      return Promise.resolve({
        ok: true,
        page: {
          members: [
            {
              providerSubjectId: second ? 'provider-user-2' : 'provider-user-1',
              displayName: second ? 'Jordan Learner' : 'Avery Learner',
              roles: ['learner'],
              status: 'active',
              email: second ? 'jordan@example.edu' : 'avery@example.edu',
              pictureUrl: 'https://lms.example/profile.jpg',
            },
          ],
          nextContinuation: second ? null : 'opaque-next-url',
        },
      });
    },
  };
}

function unavailableConnector(): RosterConnector {
  return {
    listPage() {
      return Promise.resolve({ ok: false, errorCode: 'upstream_unavailable' });
    },
  };
}

function testEnv() {
  return createObjectEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });
}

function idSequence(): () => string {
  let next = 0;
  return () => `id-${++next}`;
}
