import { assertEquals, assertExists, assertObjectMatch, assertStringIncludes } from '@std/assert';
import { compactVerify, createLocalJWKSet } from 'jose';
import type { BootstrapPayload } from '../sdk/app-sdk.ts';
import { createApp } from './app.ts';
import { EXAMPLE_SNAPSHOT_ROOT } from './app_test_support.ts';
import { createObjectEnvReader } from './platform/env.ts';
import { getPublicJwkSet } from './lti/tool_key.ts';
import {
  createR2RuntimeArtifactStore,
  type RuntimeArtifactBucket,
} from './runtime/artifact_store.ts';
import {
  contentTypeForRuntimePath,
  createDirectRuntimeDelivery,
  type RuntimeDelivery,
} from './runtime/delivery.ts';
import {
  buildAttemptRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildRuntimeSessionRecord, getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';

const RUNTIME_ENV = createObjectEnvReader({
  APP_ORIGIN: 'https://lantern.example',
  APP_RUNTIME_ORIGIN: 'https://runtime.lantern.example',
  LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
});
const EXAMPLE_RUNTIME_ARTIFACT_STORE = createR2RuntimeArtifactStore(
  createRuntimeArtifactBucket({
    [`${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`]:
      '<!doctype html><html><head><title>Chapter 4 Asteroids</title></head><body>Chapter 4 Asteroids</body></html>',
    [`${EXAMPLE_SNAPSHOT_ROOT}/dist/app.js`]: 'console.log("Attempt finalized");\n',
    [`${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`]:
      '{"title":"Chapter 4 Asteroids","questions":[{"id":"q1"}]}',
  }),
);

Deno.test('GET /runtime/sessions/:id serves the reviewed entrypoint with a signed Lantern bootstrap injected through the runtime delivery seam', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
        runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const response = await createRuntimeTestApp({
    repository,
    runtimeDelivery: createStubRuntimeDelivery({
      substrate: 'dynamic_worker',
      reviewedAssets: {
        'dist/index.html':
          '<!doctype html><html><head><title>Worker Delivered</title></head><body>Worker Delivered</body></html>',
      },
    }),
  }).request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123',
  );

  assertEquals(response.status, 200);
  const body = await response.text();
  const bootstrap = extractBootstrapFromHtml(body);

  assertStringIncludes(body, 'GatewayBootstrap');
  assertStringIncludes(body, 'attempt-123');
  assertStringIncludes(body, 'runtime-token-123');
  assertStringIncludes(body, 'Worker Delivered');
  assertStringIncludes(
    body,
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/',
  );
  assertStringIncludes(
    body,
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/content',
  );
  assertEquals(
    bootstrap.app.runtime_contract_signature,
    'test-reviewed-runtime-contract-signature',
  );
  assertEquals(bootstrap.session.expires_at, '2030-03-26T02:45:00Z');
  assertEquals(body.includes('https://canvas.example/api/lti/courses/42/line_items'), false);
  await assertBootstrapSignature(bootstrap);
  const runtimeSessionEvents = await repository.listAuditEventsByEventType(
    'runtime.session.started',
  );

  assertEquals(runtimeSessionEvents.length, 1);
  const runtimeSessionEvent = runtimeSessionEvents[0];

  assertExists(runtimeSessionEvent);
  assertObjectMatch(runtimeSessionEvent, {
    attemptId: 'attempt-123',
    detail: {
      packageVersionId: 1,
      packageVersion: '0.1.0',
      artifactDigest: 'sha256:chapter-4-asteroids-0.1.0',
      runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
      sandboxModel: 'contained_browser_runtime',
      boundary: 'app_runtime_origin',
      deliverySubstrate: 'dynamic_worker',
      deliveryWorkerId: 'reviewed-runtime:v1:test-reviewed-runtime-contract-signature',
    },
  });
});

Deno.test('POST /runtime/sessions/:id/attempt-events enforces session auth, capability checks, and append-only event writes', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
    runtimeSessions: [buildRuntimeSessionRecord({ expiresAt: '2030-03-26T02:45:00Z' })],
  });
  const app = createRuntimeTestApp({ repository });

  const response = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/attempt-events',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer runtime-token-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'answer',
        questionId: 'q1',
        answer: 'asteroid',
        timestamp: '2026-03-24T02:30:00Z',
      }),
    },
  );

  assertEquals(response.status, 202);

  const events = await repository.listAttemptEvents('attempt-123');
  const auditEvents = await repository.listAuditEventsByEventType('attempt.submitted');

  assertEquals(events.length, 1);
  assertEquals(events[0]?.eventType, 'answer');
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.attemptId, 'attempt-123');
});

Deno.test('GET /runtime/sessions/:id/content serves reviewed activity content through the scoped runtime bridge', async () => {
  const response = await createRuntimeTestApp({
    repository: createInMemoryPackageReviewRepository({
      runtimeSessions: [
        buildRuntimeSessionRecord({
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
          expiresAt: '2030-03-26T02:45:00Z',
        }),
      ],
    }),
  }).request('https://runtime.lantern.example/runtime/sessions/runtime-session-123/content', {
    headers: { Authorization: 'Bearer runtime-token-123' },
  });

  assertEquals(response.status, 200);
  const body = (await response.json()) as {
    title: string;
    questions: Array<{ id: string }>;
  };

  assertEquals(body.title, 'Chapter 4 Asteroids');
  assertEquals(body.questions[0]?.id, 'q1');
});

Deno.test('runtime routes record timeout and integrity failures as durable typed runtime outcomes', async () => {
  const timeoutRepository = createInMemoryPackageReviewRepository({
    runtimeSessions: [
      buildRuntimeSessionRecord({
        snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
        entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
        contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
        expiresAt: '2020-03-26T02:45:00Z',
      }),
    ],
  });
  const timeoutResponse = await createRuntimeTestApp({
    repository: timeoutRepository,
  }).request('https://runtime.lantern.example/runtime/sessions/runtime-session-123/content', {
    headers: { Authorization: 'Bearer runtime-token-123' },
  });

  assertEquals(timeoutResponse.status, 409);
  const timeoutEvents = await timeoutRepository.listAuditEventsByEventType(
    'runtime.session.timeout',
  );

  assertEquals(timeoutEvents.length, 1);
  const timeoutEvent = timeoutEvents[0];

  assertExists(timeoutEvent);
  assertObjectMatch(timeoutEvent, {
    status: 'failed',
    detail: {
      code: 'session_expired',
      sandboxModel: 'contained_browser_runtime',
      boundary: 'app_runtime_origin',
      deliverySubstrate: 'direct',
    },
  });

  const integrityRepository = createInMemoryPackageReviewRepository({
    runtimeSessions: [
      buildRuntimeSessionRecord({
        packageVersionId: 99,
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const integrityResponse = await createRuntimeTestApp({
    repository: integrityRepository,
  }).request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123',
  );

  assertEquals(integrityResponse.status, 409);
  const integrityEvents = await integrityRepository.listAuditEventsByEventType(
    'runtime.session.integrity_failed',
  );

  assertEquals(integrityEvents.length, 1);
  const integrityEvent = integrityEvents[0];

  assertExists(integrityEvent);
  assertObjectMatch(integrityEvent, {
    detail: {
      code: 'package_version_missing',
      sandboxModel: 'contained_browser_runtime',
      boundary: 'app_runtime_origin',
      deliverySubstrate: 'direct',
    },
  });
});

Deno.test('runtime local-state routes round-trip attempt-bound state and reject bad tokens', async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const app = createRuntimeTestApp({ repository });
  const firstRead = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/local-state',
    {
      headers: { Authorization: 'Bearer runtime-token-123' },
    },
  );
  const writeResponse = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/local-state',
    {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer runtime-token-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        currentCheckpoint: 'wave-2',
        answers: {
          q1: 'asteroid',
        },
      }),
    },
  );
  const secondRead = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/local-state',
    {
      headers: { Authorization: 'Bearer runtime-token-123' },
    },
  );
  const deniedRead = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/local-state',
    {
      headers: { Authorization: 'Bearer wrong-token' },
    },
  );

  assertEquals(firstRead.status, 200);
  assertEquals(await firstRead.json(), null);
  assertEquals(writeResponse.status, 204);
  assertEquals(await secondRead.json(), {
    currentCheckpoint: 'wave-2',
    answers: {
      q1: 'asteroid',
    },
  });
  assertEquals(deniedRead.status, 409);
  assertStringIncludes(
    await deniedRead.text(),
    'Runtime session token did not match the requested session.',
  );
});

Deno.test('GET /runtime/sessions/:id/files/* serves reviewed asset bytes and blocks bad tokens', async () => {
  const app = createRuntimeTestApp({
    repository: createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 1,
          approvalStatus: 'approved',
          reviewedAt: '2026-03-23T18:05:00Z',
        }),
      ],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
          expiresAt: '2030-03-26T02:45:00Z',
        }),
      ],
    }),
  });
  const queryTokenResponse = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/dist/app.js?token=runtime-token-123',
  );
  const goodPathTokenResponse = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/app.js',
  );
  const deniedPathTokenResponse = await app.request(
    'https://runtime.lantern.example/runtime/sessions/runtime-session-123/files/__token__/wrong-token/dist/app.js',
  );

  assertEquals(queryTokenResponse.status, 409);
  assertEquals(goodPathTokenResponse.status, 200);
  assertStringIncludes(await queryTokenResponse.text(), 'Runtime file path is invalid.');
  assertStringIncludes(await goodPathTokenResponse.text(), 'Attempt finalized');
  assertEquals(deniedPathTokenResponse.status, 409);
  assertStringIncludes(
    await deniedPathTokenResponse.text(),
    'Runtime session token did not match the requested session.',
  );
});

Deno.test('GET /runtime/sessions/:id fails clearly when served outside the configured runtime origin', async () => {
  const response = await createRuntimeTestApp({
    repository: createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          id: 1,
          approvalStatus: 'approved',
          reviewedAt: '2026-03-23T18:05:00Z',
          runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
        }),
      ],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
          entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
          contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
          expiresAt: '2030-03-26T02:45:00Z',
        }),
      ],
    }),
  }).request(
    'https://lantern.example/runtime/sessions/runtime-session-123?token=runtime-token-123',
  );
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(body, 'Runtime session requests must use APP_RUNTIME_ORIGIN.');
});

function createRuntimeTestApp(input: {
  repository: ReturnType<typeof createInMemoryPackageReviewRepository>;
  runtimeDelivery?: RuntimeDelivery;
}) {
  return createApp({
    env: RUNTIME_ENV,
    runtimeArtifactStore: EXAMPLE_RUNTIME_ARTIFACT_STORE,
    runtimeDelivery: input.runtimeDelivery ??
      createDirectRuntimeDelivery(EXAMPLE_RUNTIME_ARTIFACT_STORE),
    getRepository: () => input.repository,
  });
}

function createStubRuntimeDelivery(input: {
  substrate: RuntimeDelivery['substrate'];
  reviewedAssets: Record<string, string>;
  browserGraderAssets?: Record<string, string>;
}): RuntimeDelivery {
  return {
    substrate: input.substrate,
    describeDelivery({ reviewedPackage }) {
      return {
        substrate: input.substrate,
        workerId: input.substrate === 'dynamic_worker'
          ? `reviewed-runtime:v1:${reviewedPackage.runtimeContractSignature}`
          : null,
      };
    },
    loadReviewedAsset({ relativePath }) {
      const contents = input.reviewedAssets[relativePath];

      if (contents === undefined) {
        return Promise.reject(new Error(`Stub reviewed asset ${relativePath} was not configured.`));
      }

      return Promise.resolve({
        bytes: new TextEncoder().encode(contents),
        contentType: contentTypeForRuntimePath(relativePath),
      });
    },
    loadBrowserGraderAsset({ assetPath }) {
      const contents = input.browserGraderAssets?.[assetPath];

      if (contents === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        bytes: new TextEncoder().encode(contents),
        contentType: contentTypeForRuntimePath(assetPath),
      });
    },
  };
}

function extractBootstrapFromHtml(html: string): BootstrapPayload {
  const match = html.match(/window\.GatewayBootstrap = (.+?);\nwindow\.GatewayPreview =/s);

  if (!match?.[1]) {
    throw new Error('Expected GatewayBootstrap in runtime HTML.');
  }

  return JSON.parse(match[1]) as BootstrapPayload;
}

async function assertBootstrapSignature(bootstrap: BootstrapPayload): Promise<void> {
  const verified = await compactVerify(
    bootstrap.signature,
    createLocalJWKSet(await getPublicJwkSet(createToolKeyEnv())),
  );
  const payload = JSON.parse(new TextDecoder().decode(verified.payload));

  assertEquals(payload, {
    launch: bootstrap.launch,
    app: {
      app_id: bootstrap.app.app_id,
      version: bootstrap.app.version,
      capabilities: bootstrap.app.capabilities,
      runtime_contract_signature: bootstrap.app.runtime_contract_signature,
    },
    session: {
      attempt_id: bootstrap.session.attempt_id,
      token: bootstrap.session.token,
      expires_at: bootstrap.session.expires_at,
    },
  });
}

function createToolKeyEnv(): { get(name: string): string | undefined } {
  return {
    get(name: string): string | undefined {
      return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
    },
  };
}

function createRuntimeArtifactBucket(files: Record<string, string>): RuntimeArtifactBucket {
  const encodedFiles = new Map(
    Object.entries(files).map(([path, contents]) => [path, new TextEncoder().encode(contents)]),
  );

  return {
    get(key: string) {
      const bytes = encodedFiles.get(key);

      if (bytes === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        arrayBuffer() {
          return Promise.resolve(bytes.slice().buffer);
        },
      });
    },
  };
}
