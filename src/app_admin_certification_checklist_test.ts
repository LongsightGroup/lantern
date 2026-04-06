import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { formatDateTime } from './admin/layout.ts';
import { createApp } from './app.ts';
import { buildCanvasDeploymentBinding } from './test_helpers/lti.ts';
import {
  buildCertificationWorkflowStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

function assertTextAppearsInOrder(body: string, labels: string[]): void {
  let previousIndex = -1;

  for (const label of labels) {
    const index = body.indexOf(label);
    assert(index >= 0, `Expected "${label}" to appear in the response body.`);
    assert(
      index > previousIndex,
      `Expected "${label}" to appear after the previous checklist label.`,
    );
    previousIndex = index;
  }
}

Deno.test('GET /admin/verification renders one certification checklist in Core, Deep Linking, NRPS, and AGS order', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
    certificationWorkflowStatuses: [
      buildCertificationWorkflowStatus({
        workflowKey: 'core',
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'deepLinking',
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'nrps',
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'ags',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Certification checklist');
  assertStringIncludes(body, 'name="workflowKey"');
  assertTextAppearsInOrder(body, ['LTI Core', 'Deep Linking', 'NRPS', 'AGS']);
});

Deno.test('GET /admin/verification shows workflow-specific evidence, checked dates, and guidance links without blending workflows together', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        appId: 'chapter-4-asteroids',
        deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
        binding: buildCanvasDeploymentBinding(),
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
          summary: 'Core launch completed through the official certification harness.',
          evidenceUrl: 'https://example.test/certification/core',
        },
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'deepLinking',
        latestInternal: {
          deploymentRecordId: 1,
          deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
          status: 'failed',
          checkedAt: '2026-03-24T13:00:00Z',
          summary: 'Deep Linking return payload still needs another review pass.',
          evidenceUrl: 'https://example.test/certification/deep-linking',
        },
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'nrps',
        latestInternal: {
          deploymentRecordId: 1,
          deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
          status: 'pending',
          checkedAt: '2026-03-24T13:10:00Z',
          summary: 'Roster verification is still waiting on operator review.',
          evidenceUrl: 'https://example.test/certification/nrps',
        },
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'ags',
        latestInternal: null,
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Core launch completed through the official certification harness.');
  assertStringIncludes(body, 'Deep Linking return payload still needs another review pass.');
  assertStringIncludes(body, 'Roster verification is still waiting on operator review.');
  assertStringIncludes(body, formatDateTime('2026-03-24T12:50:00Z'));
  assertStringIncludes(body, formatDateTime('2026-03-24T13:00:00Z'));
  assertStringIncludes(body, formatDateTime('2026-03-24T13:10:00Z'));
  assertStringIncludes(body, 'https://example.test/certification/core');
  assertStringIncludes(body, 'https://example.test/certification/deep-linking');
  assertStringIncludes(body, 'https://example.test/certification/nrps');
  assertStringIncludes(body, 'Run the LTI Core workflow in the official 1EdTech suite.');
  assertStringIncludes(body, 'Run the Deep Linking workflow in the official 1EdTech suite.');
  assertStringIncludes(
    body,
    '/admin/packages/chapter-4-asteroids/deployment?lms=canvas&amp;view=activity#activity-details',
  );
  assertStringIncludes(body, 'No internal evidence has been recorded for AGS yet.');
  assertEquals(body.includes('A passed Core row does not cover Deep Linking, NRPS, or AGS.'), true);
});
