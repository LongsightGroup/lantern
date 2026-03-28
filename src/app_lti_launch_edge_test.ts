import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildReviewedPlacementRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  signCanvasIdToken,
} from './test_helpers/lti.ts';
import { withFetchStub } from './app_test_support.ts';

Deno.test('POST /lti/launch keeps reviewed assignment launches on the reviewed version and content after the deployment pin changes', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        version: '0.1.0',
        installScope: 'assignment',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.1.0',
          title: 'Chapter 4 Asteroids',
          content_files: ['/content/activity.json', '/content/bonus.json'],
        },
        artifact: {
          snapshotRoot: 'var/packages/chapter-4-asteroids/0.1.0',
          manifestPath: 'var/packages/chapter-4-asteroids/0.1.0/manifest.json',
          entrypointPath: 'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
          digest: 'sha256:chapter-4-asteroids-0.1.0',
        },
      }),
      buildPackageVersionRecord({
        id: 6,
        version: '0.2.0',
        installScope: 'assignment',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:10:00Z',
        manifestJson: {
          app_id: 'chapter-4-asteroids',
          version: '0.2.0',
          title: 'Chapter 4 Asteroids',
          content_files: ['/content/replacement.json'],
        },
        artifact: {
          snapshotRoot: 'var/packages/chapter-4-asteroids/0.2.0',
          manifestPath: 'var/packages/chapter-4-asteroids/0.2.0/manifest.json',
          entrypointPath: 'var/packages/chapter-4-asteroids/0.2.0/dist/index.html',
          digest: 'sha256:chapter-4-asteroids-0.2.0',
        },
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: 'chapter-4-asteroids-pilot',
        label: 'Chapter 4 Asteroids Pilot Deployment',
        enabledPackageVersionId: 6,
        enabledPackageVersion: '0.2.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: 'placement-123',
        deploymentRecordId: 3,
        deploymentSlug: 'chapter-4-asteroids-pilot',
        packageVersionId: 5,
        packageVersion: '0.1.0',
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-reviewed-launch',
        nonce: 'nonce-reviewed-launch',
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const formData = new FormData();

  formData.set('state', 'state-reviewed-launch');
  formData.set(
    'id_token',
    await signCanvasIdToken({
      nonce: 'nonce-reviewed-launch',
      audience: '10000000000001',
      issuedAt: '2026-03-24T00:45:00Z',
      expirationTime: '2h',
      resourceLinkId: 'resource-link-reviewed',
      custom: { lantern_placement_id: 'placement-123' },
    }),
  );

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify(getTestCanvasJwks()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request('http://localhost/lti/launch', {
        method: 'POST',
        body: formData,
      });

      assertEquals(response.status, 303);
      const location = response.headers.get('location');

      if (!location) {
        throw new Error('Expected runtime-session handoff redirect.');
      }

      const sessionId = location.match(/\/runtime\/sessions\/([^?]+)/)?.[1];

      if (!sessionId) {
        throw new Error('Expected runtime session id in redirect.');
      }

      const saved = await repository.getRuntimeSessionById(sessionId);
      const attempt = saved ? await repository.getAttemptById(saved.attemptId) : null;
      const placement = await repository.getReviewedPlacementById('placement-123');

      assertEquals(saved?.packageVersionId, 5);
      assertEquals(saved?.packageVersion, '0.1.0');
      assertEquals(saved?.contentPath, 'var/packages/chapter-4-asteroids/0.1.0/content/bonus.json');
      assertEquals(saved?.launch.activityId, '/content/bonus.json');
      assertEquals(attempt?.packageVersionId, 5);
      assertEquals(attempt?.activityId, '/content/bonus.json');
      assertEquals(placement?.resourceLinkId, 'resource-link-reviewed');
    },
  );
});

Deno.test('POST /lti/launch rejects bad signed launches before any runtime handoff', async () => {
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
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: 'state-invalid-launch',
        nonce: 'nonce-invalid-launch',
        expiresAt: '2030-03-26T02:45:00Z',
      }),
    ],
  });
  const formData = new FormData();

  formData.set('state', 'state-invalid-launch');
  formData.set(
    'id_token',
    await signCanvasIdToken({
      nonce: 'nonce-invalid-launch',
      issuedAt: '2026-03-24T00:45:00Z',
      expirationTime: '2h',
    }),
  );

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request('http://localhost/lti/launch', {
        method: 'POST',
        body: formData,
      });
      const body = await response.text();

      assertEquals(response.status, 409);
      assertStringIncludes(body, 'Launch id_token signature or issuer validation failed.');

      const auditEvents = await repository.listAuditEventsByEventType('launch.rejected');

      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.deploymentRecordId, 3);
      assertEquals(auditEvents[0]?.packageVersionId, 5);
      assertEquals(auditEvents[0]?.detail.code, 'signature_validation_failed');
      assertEquals(JSON.stringify(auditEvents[0]?.detail ?? {}).includes('secret-id-token'), false);
    },
  );
});
