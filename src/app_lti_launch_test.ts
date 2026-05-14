import { assertEquals, assertStringIncludes } from '@std/assert';
import { compactVerify, createLocalJWKSet } from 'jose';
import type { BootstrapPayload } from '../sdk/app-sdk.ts';
import { createApp } from './app.ts';
import { createObjectEnvReader } from './platform/env.ts';
import { getPublicJwkSet } from './lti/tool_key.ts';
import { CANVAS_LTI_SCOPES } from './lti/types.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  getTestToolPrivateJwkEnvValue,
  signCanvasIdToken,
} from './test_helpers/lti.ts';
import { withFetchStub } from './app_test_support.ts';

Deno.test('POST /lti/launch validates the signed launch and redirects to a runtime-session handoff with a signed runtime bootstrap', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: 'approved',
        reviewNotes: 'Ready for pilot.',
        reviewedAt: '2026-03-23T18:05:00Z',
        runtimeContractSignature: 'test-reviewed-runtime-contract-signature',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: 'chapter-4-asteroids-pilot',
        label: 'Chapter 4 Asteroids Pilot Deployment',
        enabledPackageVersionId: 5,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
        ltiProfileOverride: 'certification',
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-launch-123',
        nonce: 'nonce-launch-123',
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-launch-123',
    audience: '10000000000001',
    issuedAt: '2026-03-24T00:45:00Z',
    expirationTime: '2h',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    preferredUsername: 'adal',
  });
  const formData = new FormData();
  const env = createObjectEnvReader({
    APP_ORIGIN: 'https://lantern.example',
    APP_RUNTIME_ORIGIN: 'https://runtime.lantern.example',
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });

  formData.set('state', 'state-launch-123');
  formData.set('id_token', idToken);

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify(getTestCanvasJwks()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    async () => {
      const app = createApp({
        env,
        getRepository: () => repository,
      });
      const response = await app.request('https://lantern.example/lti/launch', {
        method: 'POST',
        body: formData,
      });

      assertEquals(response.status, 303);
      const location = response.headers.get('location');

      if (!location) {
        throw new Error('Expected runtime-session handoff redirect.');
      }

      assertStringIncludes(location, 'https://runtime.lantern.example/runtime/sessions/');
      assertStringIncludes(location, 'token=');

      const sessionId = location.match(/\/runtime\/sessions\/([^?]+)/)?.[1];

      if (!sessionId) {
        throw new Error('Expected runtime session id in redirect.');
      }

      const saved = await repository.getRuntimeSessionById(sessionId);

      if (!saved) {
        throw new Error('Expected saved runtime session.');
      }

      const attempt = await repository.getAttemptById(saved.attemptId);
      const auditEvents = await repository.listAuditEventsByEventType('launch.accepted');
      const runtimeResponse = await app.request(location);
      const runtimeBody = await runtimeResponse.text();

      assertEquals(runtimeResponse.status, 200, runtimeBody);
      const bootstrap = extractBootstrapFromHtml(runtimeBody);

      assertEquals(saved.packageVersionId, 5);
      assertEquals(typeof saved.attemptId, 'string');
      assertEquals(saved.launch.userRole, 'learner');
      assertEquals(saved.services.ags?.scope, [...CANVAS_LTI_SCOPES].slice(0, 2));
      assertEquals(saved.services.nrps?.contextMembershipsUrl?.includes('names_and_roles'), true);
      assertEquals(attempt?.attemptId, saved.attemptId);
      assertEquals(attempt?.userDisplayName, 'Ada Lovelace');
      assertEquals(attempt?.userEmail, 'ada@example.com');
      assertEquals(attempt?.userLogin, 'adal');
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.attemptId, saved.attemptId);
      assertEquals(auditEvents[0]?.detail.userDisplayName, 'Ada Lovelace');
      assertEquals(auditEvents[0]?.detail.userEmail, 'ada@example.com');
      assertEquals(auditEvents[0]?.detail.userLogin, 'adal');
      assertEquals(auditEvents[0]?.detail.ltiProfileId, 'certification');
      assertEquals(auditEvents[0]?.detail.ltiProfileSource, 'deploymentOverride');
      assertEquals(
        bootstrap.app.runtime_contract_signature,
        'test-reviewed-runtime-contract-signature',
      );
      assertEquals(bootstrap.app.version, '0.1.0');
      assertEquals(bootstrap.session.attempt_id, saved.attemptId);
      assertEquals(
        runtimeBody.includes('https://canvas.example/api/lti/courses/42/line_items'),
        false,
      );
      await assertBootstrapSignature(bootstrap);
    },
  );
});

Deno.test('POST /lti/launch rejects certification-profile launches when validation would need a JWKS refetch', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: 'approved',
        reviewNotes: 'Ready for pilot.',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: 'chapter-4-asteroids-pilot',
        label: 'Chapter 4 Asteroids Pilot Deployment',
        enabledPackageVersionId: 5,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
        ltiProfileOverride: 'certification',
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-launch-cert-jwks',
        nonce: 'nonce-launch-cert-jwks',
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-launch-cert-jwks',
    audience: '10000000000001',
    issuedAt: '2026-03-24T00:45:00Z',
    expirationTime: '2h',
  });
  const formData = new FormData();
  let jwksRequests = 0;

  formData.set('state', 'state-launch-cert-jwks');
  formData.set('id_token', idToken);

  await withFetchStub(
    () => {
      jwksRequests += 1;

      return Promise.resolve(
        new Response(JSON.stringify(jwksRequests === 1 ? { keys: [] } : getTestCanvasJwks()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request('http://localhost/lti/launch', {
        method: 'POST',
        body: formData,
      });
      const body = await response.text();
      const interopEvents = await repository.listAuditEventsByEventType('interop.path_used');

      assertEquals(response.status, 409);
      assertStringIncludes(body, 'Launch id_token signature or issuer validation failed.');
      assertEquals(jwksRequests, 1);
      assertEquals(interopEvents.length, 0);
    },
  );
});

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
