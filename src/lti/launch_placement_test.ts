import { assertEquals, assertRejects } from '@std/assert';
import { validateLaunchRequest } from './launch.ts';
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  signCanvasIdToken,
} from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildReviewedPlacementRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('validateLaunchRequest resolves reviewed placements from the launch custom claim and binds the first Canvas resource link', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
      buildPackageVersionRecord({
        id: 2,
        version: '0.2.0',
        installScope: 'assignment',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:10:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: 'placement-123',
        deploymentRecordId: 7,
        packageVersionId: 2,
        packageVersion: '0.2.0',
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-123',
    audience: '10000000000001',
    resourceLinkId: 'resource-link-reviewed',
    custom: {
      lantern_placement_id: 'placement-123',
    },
  });
  const launch = await validateLaunchRequest({
    repository,
    state: 'state-123',
    idToken,
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });
  const placement = await repository.getReviewedPlacementById('placement-123');

  assertEquals(launch.packageVersionId, 2);
  assertEquals(launch.packageVersion, '0.2.0');
  assertEquals(launch.activityId, '/content/bonus.json');
  assertEquals((launch as unknown as Record<string, unknown>).contentPath, '/content/bonus.json');
  assertEquals(placement?.resourceLinkId, 'resource-link-reviewed');
  assertEquals(placement?.boundAt, '2026-03-23T22:45:00.000Z');
});

Deno.test('validateLaunchRequest rejects reviewed placement launches when the Canvas resource link does not match the bound placement', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
      buildPackageVersionRecord({
        id: 2,
        version: '0.2.0',
        installScope: 'assignment',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:10:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: 'placement-123',
        deploymentRecordId: 7,
        packageVersionId: 2,
        packageVersion: '0.2.0',
        activityId: '/content/bonus.json',
        contentPath: '/content/bonus.json',
        resourceLinkId: 'resource-link-reviewed',
        boundAt: '2026-03-23T22:40:00Z',
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: 'nonce-123',
    audience: '10000000000001',
    resourceLinkId: 'resource-link-other',
    custom: {
      lantern_placement_id: 'placement-123',
    },
  });

  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: 'state-123',
        idToken,
        now: () => new Date('2026-03-23T22:45:00Z'),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    Error,
    'Reviewed placement placement-123 is already bound to Canvas resource link resource-link-reviewed.',
  );

  const loginState = await repository.getLoginStateByState('state-123');

  assertEquals(loginState?.usedAt, null);
});

Deno.test('validateLaunchRequest keeps the deployment-pin runtime path for launches without reviewed placement keys', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: '0.1.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
      buildPackageVersionRecord({
        id: 2,
        version: '0.2.0',
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:10:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const launch = await validateLaunchRequest({
    repository,
    state: 'state-123',
    idToken: await signCanvasIdToken({
      nonce: 'nonce-123',
      audience: '10000000000001',
      resourceLinkId: 'resource-link-legacy',
    }),
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(launch.packageVersionId, 1);
  assertEquals(launch.packageVersion, '0.1.0');
  assertEquals(launch.activityId, 'resource-link-legacy');
});
