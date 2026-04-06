import { assertEquals } from '@std/assert';
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
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

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
