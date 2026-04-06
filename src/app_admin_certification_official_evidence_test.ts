import { assertEquals, assertStringIncludes } from '@std/assert';
import { formatDateTime } from './admin/layout.ts';
import { createApp } from './app.ts';
import { buildCanvasDeploymentBinding } from './test_helpers/lti.ts';
import {
  buildCertificationWorkflowStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildLatestOfficialCertificationEvidence,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('GET /admin/verification keeps official 1EdTech evidence in its own dated section', async () => {
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
        latestInternal: {
          deploymentRecordId: 1,
          deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
          status: 'passed',
          checkedAt: '2026-03-24T12:50:00Z',
          summary: 'Internal core verification passed.',
          evidenceUrl: 'https://example.test/certification/core',
        },
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
    latestOfficialCertificationEvidence: buildLatestOfficialCertificationEvidence({
      workflowKey: 'core',
      state: 'ltiAdvantageCertified',
      checkedAt: '2026-03-24T13:20:00Z',
      summary: '1EdTech lists Lantern as LTI Advantage Certified for Core.',
      directoryUrl: 'https://example.test/certification/1edtech-directory',
    }),
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Official 1EdTech evidence');
  assertStringIncludes(
    body,
    'Only the 1EdTech Product Directory supports an official certification claim.',
  );
  assertStringIncludes(body, 'Product Directory status');
  assertStringIncludes(body, 'LTI Advantage Certified');
  assertStringIncludes(body, 'Covers workflow');
  assertStringIncludes(body, 'LTI Core');
  assertStringIncludes(body, '1EdTech lists Lantern as LTI Advantage Certified for Core.');
  assertStringIncludes(body, formatDateTime('2026-03-24T13:20:00Z'));
  assertStringIncludes(body, 'https://example.test/certification/1edtech-directory');
});

Deno.test('GET /admin/verification keeps internal passed rows from reading like an official certification claim', async () => {
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
        latestInternal: {
          deploymentRecordId: 1,
          deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
          status: 'passed',
          checkedAt: '2026-03-24T12:50:00Z',
          summary: 'Internal core verification passed.',
          evidenceUrl: 'https://example.test/certification/core',
        },
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
    latestOfficialCertificationEvidence: null,
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/verification');

  assertEquals(response.status, 200);

  const body = await response.text();

  assertStringIncludes(body, 'Internal core verification passed.');
  assertStringIncludes(body, 'No official claim recorded');
  assertStringIncludes(body, 'Lantern has no recorded 1EdTech Product Directory evidence yet.');
  assertEquals(body.includes('Lantern is certified.'), false);
});
