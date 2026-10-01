import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import photoRoster from '../examples/apps/photo-roster/source/worker.ts';
import { createSyntheticRosterConnector } from './lms_kernel/connector.ts';
import { createGovernedRosterService } from './lms_kernel/service.ts';
import { createObjectEnvReader } from './platform/env.ts';
import { getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';
import { createTestApp as createApp } from './test_helpers/app.ts';
import {
  buildGovernedSyntheticSession,
  buildKernelGrant,
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
    lmsOrigin: 'https://courses.example.edu',
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
  assertStringIncludes(
    response.headers.get('content-security-policy') ?? '',
    "frame-ancestors 'self' https://courses.example.edu",
  );
  assertEquals(response.headers.get('x-lantern-trace-id'), session.launchTraceId);
  assertEquals(
    workerRequest.headers.get('x-lantern-runtime-session-id'),
    session.runtimeSessionId,
  );
  assertEquals(workerRequest.headers.get('x-lantern-trace-id'), session.launchTraceId);
  assertEquals(kernelRepository.events.at(-1)?.traceId, session.launchTraceId);
  assertEquals(kernelRepository.events.at(-1)?.eventType, 'runtime.response');
});

Deno.test('Photo Roster follows gateway-owned pagination URLs through authorization and signed cursors', async () => {
  const session = {
    ...buildGovernedSyntheticSession(),
    runtimeExpiresAt: '2099-07-19T17:00:00.000Z',
  };
  const repository = new MemoryLmsKernelRepository({
    session,
    grants: [
      buildKernelGrant('members-grant', 'lms.roster.members.read'),
      buildKernelGrant('email-grant', 'lms.roster.contact.read'),
      buildKernelGrant('photo-grant', 'lms.roster.profile_photo.read'),
    ],
  });
  const connector = createSyntheticRosterConnector();
  const roster = createGovernedRosterService({
    repository,
    nrpsConnector: connector,
    syntheticConnector: connector,
    env: createObjectEnvReader({ LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue() }),
    publicOrigin: 'https://runtime.lantern.example',
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
      return photoRoster.fetch(input.request, {
        LANTERN_LMS: {
          listRoster: (command) =>
            roster.listRoster({
              ...command,
              bindingIdentity: { appId: session.appId, packageVersionId: session.packageVersionId },
            }),
        },
      });
    },
  };
  const app = createApp({
    runtimeDelivery,
    getLmsKernelRepository: () => repository,
    getRepository: () =>
      createInMemoryPackageReviewRepository({ packageVersions: [packageVersion] }),
  });
  const launchUrl =
    `https://runtime.lantern.example/governed/sessions/${session.runtimeSessionId}?token=${session.runtimeSessionToken}&ignored=untrusted`;
  let currentUrl = launchUrl;
  for (const expectedCount of [24, 24, 9]) {
    const response = await app.request(currentUrl);
    assertEquals(response.status, 200);
    const html = await response.text();
    assertEquals((html.match(/<li class="card">/g) ?? []).length, expectedCount);
    const href = html.match(/href="([^"]+)">Next page/)?.[1];
    if (expectedCount === 9) {
      assertEquals(href, undefined);
      break;
    }
    assert(href !== undefined);
    const nextUrl = new URL(href.replaceAll('&amp;', '&'), currentUrl);
    assertEquals(nextUrl.searchParams.get('token'), session.runtimeSessionToken);
    assertEquals(nextUrl.searchParams.has('ignored'), false);
    currentUrl = nextUrl.toString();
  }
  const noToken = new URL(currentUrl);
  noToken.searchParams.delete('token');
  assertEquals((await app.request(noToken.toString())).status, 401);
});
