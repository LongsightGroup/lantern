import { assertEquals, assertStringIncludes } from '@std/assert';
import { createTestApp as createApp } from './test_helpers/app.ts';
import {
  buildGovernedSyntheticSession,
  MemoryLmsKernelRepository,
} from './lms_kernel/repository_memory_test_support.ts';
import type { GovernedRuntimeSession } from './lms_kernel/types.ts';
import { createInMemoryPackageReviewRepository } from './test_helpers/package_review.ts';
import { buildPackageVersionRecord } from './test_helpers/package_review.ts';
import type { RuntimeDelivery } from './runtime/delivery.ts';

Deno.test('governed Worker route uses the standalone session and strips app-controlled headers', async () => {
  const session: GovernedRuntimeSession = {
    ...buildGovernedSyntheticSession(),
    runtimeExpiresAt: '2099-07-19T17:00:00.000Z',
  };
  const kernelRepository = new MemoryLmsKernelRepository({
    session,
    grants: [],
  });
  const packageVersion = buildPackageVersionRecord({
    id: session.packageVersionId,
    appId: session.appId,
    version: session.packageVersion,
    runtime: { kind: 'worker', entrypoint: '/dist/worker.js' },
    capabilities: [
      'lms.roster.members.read',
      'lms.roster.contact.read',
      'lms.roster.profile_photo.read',
    ],
    approvalStatus: 'approved',
  });
  let internalRequest: Request | null = null;
  const runtimeDelivery: RuntimeDelivery = {
    substrate: 'dynamic_worker',
    describeDelivery() {
      return { substrate: 'dynamic_worker', workerId: 'worker-1' };
    },
    loadReviewedAsset() {
      return Promise.reject(new Error('not used'));
    },
    loadBrowserGraderAsset() {
      return Promise.resolve(null);
    },
    invokeReviewedWorker(input) {
      internalRequest = input.request;
      return Promise.resolve(
        new Response('<!doctype html><title>Photo Roster</title>', {
          headers: {
            'content-type': 'text/html',
            'content-language': 'en',
            'set-cookie': 'app=forbidden',
            'access-control-allow-origin': '*',
            'content-security-policy': 'default-src *',
            location: 'https://outside.example',
          },
        }),
      );
    },
  };
  const app = createApp({
    runtimeDelivery,
    getLmsKernelRepository: () => kernelRepository,
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        packageVersions: [packageVersion],
      }),
  });

  const response = await app.request(
    `https://runtime.lantern.example/governed/sessions/${session.runtimeSessionId}?token=${session.runtimeSessionToken}`,
  );
  const workerRequest = internalRequest as Request | null;
  if (workerRequest === null) {
    throw new Error('Expected the governed route to invoke the reviewed Worker.');
  }

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('set-cookie'), null);
  assertEquals(response.headers.get('access-control-allow-origin'), null);
  assertEquals(response.headers.get('location'), null);
  assertEquals(response.headers.get('cache-control'), 'private, no-store');
  assertStringIncludes(response.headers.get('content-security-policy') ?? '', "default-src 'none'");
  assertEquals(response.headers.get('x-lantern-trace-id'), session.launchTraceId);
  assertEquals(
    workerRequest.headers.get('x-lantern-runtime-session-id'),
    session.runtimeSessionId,
  );
  assertEquals(workerRequest.headers.get('x-lantern-trace-id'), session.launchTraceId);
  assertEquals(kernelRepository.events.at(-1)?.traceId, session.launchTraceId);
  assertEquals(kernelRepository.events.at(-1)?.eventType, 'runtime.response');
});
