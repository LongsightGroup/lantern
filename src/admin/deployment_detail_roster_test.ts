import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import { buildDeploymentBinding, buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import { createTestLtiToolContext } from '../test_helpers/lti_tool_context.ts';
import { createAuthenticatedTestApp } from '../test_helpers/admin_auth.ts';

Deno.test('POST /admin/packages/:appId/deployment/verify-roster stores a deployment-level NRPS verification summary from lti-tool', async () => {
  const ltiToolContext = createTestLtiToolContext({
    sessionId: 'lti-tool-session-123',
    members: [{ userId: 'learner-1' }],
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T12:25:00Z',
    },
    runtimeSessions: [
      buildRuntimeSessionRecord({
        ltiToolSessionId: 'lti-tool-session-123',
        expiresAt: '2026-03-25T02:45:00Z',
      }),
    ],
  });

  const response = await createAuthenticatedTestApp({
    getRepository: () => repository,
    getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
  }).request('http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
    },
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get('location'),
    '/admin/packages/chapter-4-asteroids/deployment',
  );

  const auditEvents = await repository.listAuditEventsByEventType('deployment.nrps_verified');

  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.status, 'succeeded');
  assertEquals(auditEvents[0]?.detail.memberCount, 1);
  assertEquals(auditEvents[0]?.detail.ltiProfileId, 'certification');
  assertEquals(auditEvents[0]?.detail.ltiProfileSource, 'lanternDefault');
});

Deno.test('deployment roster verification fails clearly when no launch service context exists yet', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
  });

  const response = await createAuthenticatedTestApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
    },
  });
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(
    body,
    'Launch the deployment from Canvas once before verifying roster access.',
  );
});

Deno.test('deployment roster verification requires a verified lti-tool session', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        ltiToolSessionId: null,
        expiresAt: '2026-03-25T02:45:00Z',
      }),
    ],
  });

  const response = await createAuthenticatedTestApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
    },
  });
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(body, 'The verified LTI session for roster verification is required.');
});
