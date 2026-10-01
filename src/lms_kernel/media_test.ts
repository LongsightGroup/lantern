import { assertEquals, assertStringIncludes } from '@std/assert';
import { createProtectedMediaService } from './media.ts';
import {
  buildGovernedSyntheticSession,
  buildKernelGrant,
  MemoryLmsKernelRepository,
} from './repository_memory_test_support.ts';

const NOW = new Date('2026-07-19T16:00:00.000Z');
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  ),
  (char) => char.charCodeAt(0),
);

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
        new Response(PNG, {
          headers: { 'content-type': 'image/png' },
        }),
      );
    },
  });

  const response = await service.fetch({ mediaId: 'media-1', now: NOW });

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('cache-control'), 'private, no-store');
  assertEquals(response.headers.get('referrer-policy'), 'no-referrer');
  assertEquals(response.headers.get('x-content-type-options'), 'nosniff');
  assertStringIncludes(response.headers.get('content-security-policy') ?? '', 'sandbox');
  assertEquals(new Uint8Array(await response.arrayBuffer()), PNG);
  assertEquals(repository.events.length, 1);
  assertEquals(repository.events[0]?.traceId, session.launchTraceId);
  assertEquals(repository.events[0]?.capability, 'lms.roster.profile_photo.read');
});

Deno.test('protected media rejects SVG and non-raster types, including MIME-spoofed SVG', async () => {
  for (
    const contentType of [
      'image/svg+xml',
      'image/svg+xml; charset=UTF-8',
      'text/html',
      'image/bmp',
      'image/png',
      'image/jpeg',
    ]
  ) {
    const repository = await mediaRepository();
    const service = createProtectedMediaService({
      repository,
      fetchUpstream: () =>
        Promise.resolve(
          new Response(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            { headers: { 'content-type': contentType } },
          ),
        ),
    });
    const response = await service.fetch({ mediaId: 'media-1', now: NOW });
    assertEquals(response.status, 502, contentType);
    assertEquals((await response.text()).includes('<script>'), false);
    assertEquals(response.headers.get('x-content-type-options'), 'nosniff');
    assertStringIncludes(response.headers.get('content-security-policy') ?? '', 'sandbox');
    assertEquals(repository.events.at(-1)?.outcome, 'failed');
  }
});

Deno.test('protected media verifies and preserves raster bytes across upstream stream chunks', async () => {
  const formats = [
    { type: 'image/png', bytes: PNG },
    {
      type: 'image/jpeg',
      bytes: new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]),
    },
    { type: 'image/gif', bytes: new TextEncoder().encode('GIF89a123456') },
    { type: 'image/webp', bytes: new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]) },
  ];
  for (const format of formats) {
    const repository = await mediaRepository();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(format.bytes.subarray(0, 2));
        controller.enqueue(format.bytes.subarray(2, 7));
        controller.enqueue(format.bytes.subarray(7));
        controller.close();
      },
    });
    const service = createProtectedMediaService({
      repository,
      fetchUpstream: () =>
        Promise.resolve(
          new Response(body, { headers: { 'content-type': `${format.type}; charset=binary` } }),
        ),
    });
    const response = await service.fetch({ mediaId: 'media-1', now: NOW });
    assertEquals(response.status, 200, format.type);
    assertEquals(response.headers.get('content-type'), format.type);
    assertEquals(new Uint8Array(await response.arrayBuffer()), format.bytes);
  }
});

async function mediaRepository(): Promise<MemoryLmsKernelRepository> {
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
  return repository;
}

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
