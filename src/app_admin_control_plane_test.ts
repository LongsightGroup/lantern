import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import type { OpsRepository } from './ops/repository.ts';
import {
  buildBrokerVerificationStatus,
  buildCertificationWorkflowStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from './test_helpers/lti.ts';

function createFailingOpsRepository(message: string): OpsRepository {
  return {
    listControlPlaneDeployments() {
      return Promise.reject(new Error(message));
    },
    getControlPlaneDeploymentDetail() {
      return Promise.reject(new Error(message));
    },
    getLatestBrokerVerification() {
      return Promise.reject(new Error(message));
    },
    getLatestBrokerVerificationStatus() {
      return Promise.reject(new Error(message));
    },
    listCertificationWorkflowStatuses() {
      return Promise.reject(new Error(message));
    },
    getLatestOfficialCertificationEvidence() {
      return Promise.reject(new Error(message));
    },
    recordBrokerVerificationRun() {
      return Promise.reject(new Error(message));
    },
    getRetryableGradePublicationLookup() {
      return Promise.reject(new Error(message));
    },
    getPlacementAuditSnapshot() {
      return Promise.reject(new Error(message));
    },
  };
}

Deno.test('GET /admin/deployments renders deployment operations on a dedicated page', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 })],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/deployments');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Connections');
  assertStringIncludes(body, 'All connections');
  assertStringIncludes(body, 'Pilot usage');
  assertStringIncludes(body, 'Next step');
  assertStringIncludes(body, 'Retry grade return');
  assertStringIncludes(body, 'Review grade problem');
  assertStringIncludes(body, 'Open settings');
  assertStringIncludes(body, 'view=activity#activity-details');
  assertEquals(body.includes('Broker verification'), false);
});

Deno.test('GET /admin/verification renders verification on a dedicated page', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: 'chapter-4-asteroids-pilot',
        deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
        binding: buildCanvasDeploymentBinding(),
        brokerVerification: buildBrokerVerificationStatus({
          internal: {
            source: 'manual',
            status: 'passed',
            checkedAt: '2026-03-24T12:50:00Z',
            summary: 'Canvas deployment verification passed.',
            evidenceUrl: 'https://example.test/internal-proof',
          },
        }),
      }),
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 2,
        deploymentSlug: 'chapter-4-asteroids-moodle',
        deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
        binding: buildMoodleDeploymentBinding(),
        brokerVerification: buildBrokerVerificationStatus({
          supportedPath: 'lti13LaunchAgsScore',
          internal: {
            source: 'ci',
            status: 'failed',
            checkedAt: '2026-03-24T12:40:00Z',
            summary: 'Moodle deployment verification failed.',
            evidenceUrl: 'https://example.test/moodle-proof',
          },
        }),
      }),
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 3,
        deploymentSlug: 'chapter-4-asteroids-sakai',
        deploymentLabel: 'Chapter 4 Asteroids Sakai Deployment',
        binding: buildSakaiDeploymentBinding(),
        brokerVerification: null,
      }),
    ],
    brokerVerifications: [
      buildBrokerVerificationStatus({
        supportedPath: 'lti13LaunchAgsScore',
        internal: null,
        official: {
          state: 'notCertified',
          checkedAt: '2026-03-24T12:55:00Z',
          directoryUrl: 'https://example.test/official-directory',
        },
      }),
    ],
    certificationWorkflowStatuses: [
      buildCertificationWorkflowStatus({
        workflowKey: 'core',
        latestInternal: {
          deploymentRecordId: 1,
          deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
          status: 'passed',
          checkedAt: '2026-03-24T12:50:00Z',
          summary: 'Canvas deployment verification passed.',
          evidenceUrl: 'https://example.test/internal-proof',
        },
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'deepLinking',
        latestInternal: {
          deploymentRecordId: 2,
          deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
          status: 'failed',
          checkedAt: '2026-03-24T12:40:00Z',
          summary: 'Moodle deployment verification failed.',
          evidenceUrl: 'https://example.test/moodle-proof',
        },
      }),
      buildCertificationWorkflowStatus({ workflowKey: 'nrps' }),
      buildCertificationWorkflowStatus({ workflowKey: 'ags' }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T13:00:00Z',
    },
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Verification');
  assertStringIncludes(body, 'Verification overview');
  assertStringIncludes(body, 'Certification checklist');
  assertStringIncludes(body, 'Chapter 4 Asteroids Pilot Deployment');
  assertStringIncludes(body, 'Chapter 4 Asteroids Moodle Deployment');
  assertStringIncludes(body, 'href="/admin/verification/new"');
  assertStringIncludes(body, 'href="/admin/verification/official"');
  assertStringIncludes(body, 'href="/admin/verification/lti-profile"');
  assertStringIncludes(body, 'class="sidebar-sublink active" href="/admin/verification"');
  assertStringIncludes(body, 'Certification');
  assertEquals(body.includes('One row per LMS connection'), false);
  assertEquals(body.includes('Supported Canvas path'), false);
  assertEquals(body.includes('Official 1EdTech listing'), false);
  assertEquals(body.includes('action="/admin/verification"'), false);
  assertEquals(body.includes('action="/admin/verification/lti-profile"'), false);
});

Deno.test('GET /admin/verification/official renders official evidence on its own page', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 })],
    brokerVerifications: [
      buildBrokerVerificationStatus({
        supportedPath: 'lti13LaunchAgsScore',
        internal: null,
        official: {
          state: 'ltiAdvantageCertified',
          checkedAt: '2026-03-24T12:55:00Z',
          directoryUrl: 'https://example.test/official-directory',
        },
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification/official');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Official 1EdTech listing');
  assertStringIncludes(body, 'Claim boundary');
  assertStringIncludes(body, 'Open directory entry');
  assertStringIncludes(body, 'class="sidebar-sublink active" href="/admin/verification/official"');
  assertEquals(body.includes('Certification checklist'), false);
});

Deno.test('GET /admin/verification/new renders the dedicated verification entry page', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord({ id: 1, approvalStatus: 'approved' })],
    controlPlaneDeployments: [buildControlPlaneDeploymentInventoryRow({ deploymentId: 1 })],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification/new');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Record one verification result');
  assertStringIncludes(body, 'action="/admin/verification"');
  assertStringIncludes(body, 'name="deploymentRecordId"');
  assertStringIncludes(body, 'name="workflowKey"');
  assertStringIncludes(body, 'name="scope"');
  assertEquals(body.includes('Certification checklist'), false);
});

Deno.test('GET /admin/verification/lti-profile renders the dedicated Lantern default page', async () => {
  const repository = createInMemoryPackageReviewRepository({
    lanternLtiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T13:00:00Z',
    },
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification/lti-profile');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Lantern default profile');
  assertStringIncludes(body, 'action="/admin/verification/lti-profile"');
  assertStringIncludes(body, 'name="defaultLtiProfile"');
  assertEquals(body.includes('Certification checklist'), false);
});

Deno.test('GET /admin/deployments keeps route failures inside the admin shell', async () => {
  const app = createApp({
    getOpsRepository: () => createFailingOpsRepository('Connections inventory is unavailable.'),
  });

  const response = await app.request('http://localhost/admin/deployments');

  assertEquals(response.status, 500);
  const body = await response.text();

  assertStringIncludes(body, 'Connections unavailable');
  assertStringIncludes(body, 'Connections inventory is unavailable.');
  assertStringIncludes(body, 'href="/admin/packages"');
  assertStringIncludes(body, 'href="/admin/deployments"');
});

Deno.test('GET /admin/verification keeps route failures inside the admin shell', async () => {
  const app = createApp({
    getOpsRepository: () => createFailingOpsRepository('Verification history is unavailable.'),
  });

  const response = await app.request('http://localhost/admin/verification');

  assertEquals(response.status, 500);
  const body = await response.text();

  assertStringIncludes(body, 'Verification unavailable');
  assertStringIncludes(body, 'Verification history is unavailable.');
  assertStringIncludes(body, 'href="/admin/packages"');
  assertStringIncludes(body, 'href="/admin/verification"');
});

Deno.test('POST /admin/verification records deployment-scoped broker verification evidence and redirects back to verification', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: 'chapter-4-asteroids-pilot',
        deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
        binding: buildCanvasDeploymentBinding(),
        brokerVerification: null,
      }),
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 2,
        deploymentSlug: 'chapter-4-asteroids-moodle',
        deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('source', 'manual');
  formData.set('deploymentRecordId', '2');
  formData.set('scope', 'lti13LaunchAgsScore');
  formData.set('workflowKey', 'ags');
  formData.set('status', 'passed');
  formData.set('summary', 'Manual verification passed for the saved Moodle deployment.');
  formData.set('detailUrl', 'https://example.test/verification/manual-pass');
  formData.set('checkedAt', '2026-03-24T12:50:00Z');

  const response = await app.request('http://localhost/admin/verification', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get('location'), '/admin/verification');

  const latestVerification = await repository.getLatestBrokerVerification();
  const deployments = await repository.listControlPlaneDeployments();
  const moodleVerification = deployments.find(
    (deployment) => deployment.deploymentId === 2,
  )?.brokerVerification;
  const canvasVerification = deployments.find(
    (deployment) => deployment.deploymentId === 1,
  )?.brokerVerification;

  assertEquals(latestVerification?.supportedPath, 'lti13LaunchAgsScore');
  assertEquals(latestVerification?.internal?.source, 'manual');
  assertEquals(latestVerification?.internal?.status, 'passed');
  assertEquals(
    latestVerification?.internal?.summary,
    'Manual verification passed for the saved Moodle deployment.',
  );
  assertEquals(
    latestVerification?.internal?.evidenceUrl,
    'https://example.test/verification/manual-pass',
  );
  assertEquals(moodleVerification?.internal?.status, 'passed');
  assertEquals(
    moodleVerification?.internal?.summary,
    'Manual verification passed for the saved Moodle deployment.',
  );
  assertEquals(canvasVerification?.internal?.summary ?? null, null);
  assertEquals(latestVerification?.official.state, 'notCertified');
});

Deno.test('POST /admin/verification/lti-profile saves the Lantern-wide default profile and redirects back to the profile page', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('defaultLtiProfile', 'certification');

  const response = await app.request('http://localhost/admin/verification/lti-profile', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get('location'), '/admin/verification/lti-profile');
  assertEquals(
    (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
    'certification',
  );
});

Deno.test('POST /admin/verification/lti-profile rejects unsupported profile ids on the profile page', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set('defaultLtiProfile', 'too-loose');

  const response = await app.request('http://localhost/admin/verification/lti-profile', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 400);
  const body = await response.text();

  assertStringIncludes(body, 'Lantern default blocked');
  assertStringIncludes(body, 'Choose one supported LTI profile.');
  assertStringIncludes(body, 'Lantern default profile');
  assertEquals(
    (await repository.getLanternLtiProfileSettings()).defaultLtiProfile,
    'governedCompatibility',
  );
});
