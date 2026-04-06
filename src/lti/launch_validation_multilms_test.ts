import { assertEquals } from '@std/assert';
import { validateLaunchRequest } from './launch.ts';
import {
  buildLoginStateRecord,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
  getTestCanvasJwks,
  signCanvasIdToken,
} from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('validateLaunchRequest accepts a signed Sakai launch with matching state and deployment binding', async () => {
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
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildSakaiDeploymentBinding({
          issuer: 'https://sakai.example',
          clientId: '7dbe6a13-f948-498c-87d7-768947ac5c56',
          deploymentId: '1',
        }),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        lms: 'sakai',
        issuer: 'https://sakai.example',
        clientId: '7dbe6a13-f948-498c-87d7-768947ac5c56',
        deploymentId: '1',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    deploymentBinding: {
      issuer: 'https://sakai.example',
      clientId: '7dbe6a13-f948-498c-87d7-768947ac5c56',
      deploymentId: '1',
    },
    nonce: 'nonce-123',
    audience: '7dbe6a13-f948-498c-87d7-768947ac5c56',
    name: 'Sakai Instructor',
    email: 'sakai@example.edu',
    preferredUsername: 'sakai-instructor',
  });
  const launch = await validateLaunchRequest({
    repository,
    state: 'state-123',
    idToken,
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(launch.lms, 'sakai');
  assertEquals(launch.canvasEnvironment, null);
  assertEquals(launch.deploymentId, '1');
  assertEquals(launch.clientId, '7dbe6a13-f948-498c-87d7-768947ac5c56');
  assertEquals(launch.appId, 'chapter-4-asteroids');
  assertEquals(launch.userDisplayName, 'Sakai Instructor');
  assertEquals(launch.userEmail, 'sakai@example.edu');
  assertEquals(launch.userLogin, 'sakai-instructor');
});

Deno.test('validateLaunchRequest accepts a signed Moodle launch with matching state and deployment binding', async () => {
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
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildMoodleDeploymentBinding({
          issuer: 'https://moodle.example',
          clientId: 'moodle-client-123',
          deploymentId: 'moodle-deployment-123',
        }),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        lms: 'moodle',
        issuer: 'https://moodle.example',
        clientId: 'moodle-client-123',
        deploymentId: 'moodle-deployment-123',
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    deploymentBinding: {
      issuer: 'https://moodle.example',
      clientId: 'moodle-client-123',
      deploymentId: 'moodle-deployment-123',
    },
    nonce: 'nonce-123',
    audience: 'moodle-client-123',
    givenName: 'Moodle',
    familyName: 'Teacher',
    email: 'moodle@example.edu',
    preferredUsername: 'mteacher',
  });
  const launch = await validateLaunchRequest({
    repository,
    state: 'state-123',
    idToken,
    now: () => new Date('2026-03-23T22:45:00Z'),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(launch.lms, 'moodle');
  assertEquals(launch.canvasEnvironment, null);
  assertEquals(launch.deploymentId, 'moodle-deployment-123');
  assertEquals(launch.clientId, 'moodle-client-123');
  assertEquals(launch.resourceLinkId, 'resource-link-123');
  assertEquals(launch.contextId, 'course-42');
  assertEquals(launch.appId, 'chapter-4-asteroids');
  assertEquals(launch.userDisplayName, 'Moodle Teacher');
  assertEquals(launch.userEmail, 'moodle@example.edu');
  assertEquals(launch.userLogin, 'mteacher');
});
