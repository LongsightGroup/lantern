import { assertEquals } from '@std/assert';
import { createProtectedMediaService } from './media.ts';
import {
  buildGovernedSyntheticSession,
  buildKernelGrant,
  MemoryLmsKernelRepository,
} from './repository_memory_test_support.ts';

const NOW = new Date('2026-07-19T16:00:00.000Z');

Deno.test('protected media revalidates the photo grant and records the shared trace', async () => {
  const session = buildGovernedSyntheticSession();
  const repository = new MemoryLmsKernelRepository({
    session,
    grants: [buildKernelGrant('photo-grant', 'lms.roster.profile_photo.read')],
  });
  await repository.saveProtectedMediaReference({
    id: 'media-1',
    traceId: session.launchTraceId,
    institutionId: session.institutionId,
    lmsConnectionId: session.lmsConnectionId,
    lmsContextId: session.lmsContextId,
    runtimeSessionId: session.runtimeSessionId,
    appInstallationId: session.appInstallationId,
    packageVersionId: session.packageVersionId,
    subjectIdentityId: 'subject-1',
    actorSubjectId: session.actorSubjectId,
    actorType: session.actorType,
    connectorKind: session.connectorKind,
    sourceUrl: 'https://images.lms.example/profile.png',
    expiresAt: '2026-07-19T16:05:00.000Z',
  });
  const service = createProtectedMediaService({
    repository,
    fetchUpstream() {
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/png' },
        }),
      );
    },
  });

  const response = await service.fetch({ mediaId: 'media-1', now: NOW });

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('cache-control'), 'private, no-store');
  assertEquals(response.headers.get('referrer-policy'), 'no-referrer');
  assertEquals(repository.events.length, 1);
  assertEquals(repository.events[0]?.traceId, session.launchTraceId);
  assertEquals(repository.events[0]?.capability, 'lms.roster.profile_photo.read');
});

Deno.test('protected media denies a reference after photo permission is revoked', async () => {
  const session = buildGovernedSyntheticSession();
  const repository = new MemoryLmsKernelRepository({
    session,
    grants: [{
      ...buildKernelGrant('photo-grant', 'lms.roster.profile_photo.read'),
      revokedByUserId: 'admin-1',
      revokedAt: '2026-07-19T15:59:00.000Z',
    }],
  });
  await repository.saveProtectedMediaReference({
    id: 'media-1',
    traceId: session.launchTraceId,
    institutionId: session.institutionId,
    lmsConnectionId: session.lmsConnectionId,
    lmsContextId: session.lmsContextId,
    runtimeSessionId: session.runtimeSessionId,
    appInstallationId: session.appInstallationId,
    packageVersionId: session.packageVersionId,
    subjectIdentityId: 'subject-1',
    actorSubjectId: session.actorSubjectId,
    actorType: session.actorType,
    connectorKind: session.connectorKind,
    sourceUrl: 'https://images.lms.example/profile.png',
    expiresAt: '2026-07-19T16:05:00.000Z',
  });
  let called = false;
  const service = createProtectedMediaService({
    repository,
    fetchUpstream() {
      called = true;
      return Promise.resolve(new Response());
    },
  });

  const response = await service.fetch({ mediaId: 'media-1', now: NOW });

  assertEquals(response.status, 404);
  assertEquals(called, false);
});
