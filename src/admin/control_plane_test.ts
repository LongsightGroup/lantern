import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  buildBrokerVerificationStatus,
  buildCertificationWorkflowStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildLatestOfficialCertificationEvidence,
  buildOfficialBrokerCertificationStatus,
} from '../test_helpers/package_review.ts';
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from '../test_helpers/lti.ts';
import { renderDeploymentsPage, renderVerificationPage } from './control_plane.ts';

Deno.test('renderDeploymentsPage keeps deployment operations separate from verification entry', () => {
  const html = renderDeploymentsPage({
    deployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: 'chapter-4-asteroids-pilot',
        deploymentLabel: 'Chapter 4 Asteroids Pilot Deployment',
        lastGradePublishStatus: 'failed',
      }),
    ],
  });

  assertStringIncludes(html, 'Connections');
  assertStringIncludes(html, 'Chapter 4 Asteroids Pilot Deployment');
  assertStringIncludes(html, 'Pilot usage');
  assertStringIncludes(html, 'Recent active users');
  assertStringIncludes(html, 'Next step');
  assertStringIncludes(html, 'Retry grade return');
  assertStringIncludes(html, 'Review grade problem');
  assertStringIncludes(html, 'Open settings');
  assertStringIncludes(html, 'view=activity#activity-details');
  assertEquals(html.includes('Broker verification'), false);
  assertEquals(html.includes('Save check result'), false);
});

Deno.test('renderDeploymentsPage shows one clear setup action when an LMS is not connected yet', () => {
  const deployment = buildControlPlaneDeploymentInventoryRow({
    deploymentId: 2,
    deploymentSlug: 'chapter-4-asteroids-moodle',
    deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
    lastLaunchAt: null,
    lastLaunchStatus: null,
    lastGradePublishAt: null,
    lastGradePublishStatus: null,
  });
  deployment.binding = null;
  deployment.enabledPackageVersionId = null;
  deployment.enabledPackageVersion = null;

  const html = renderDeploymentsPage({
    deployments: [deployment],
  });

  assertStringIncludes(html, 'Next step');
  assertStringIncludes(html, 'Connect LMS');
  assertEquals(html.includes('View launches and problems'), false);
});

Deno.test('renderVerificationPage shows deployment-scoped verification facts while keeping official evidence separate', () => {
  const html = renderVerificationPage({
    deployments: [
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
        brokerVerification: buildBrokerVerificationStatus({
          supportedPath: 'lti13LaunchAgsScore',
          internal: null,
        }),
      }),
    ],
    latestBrokerVerification: buildBrokerVerificationStatus({
      supportedPath: 'lti13LaunchAgsScore',
      internal: null,
      official: buildOfficialBrokerCertificationStatus({
        state: 'notCertified',
        checkedAt: '2026-03-24T12:55:00Z',
        directoryUrl: 'https://example.test/official-directory',
      }),
    }),
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
      buildCertificationWorkflowStatus({
        workflowKey: 'nrps',
        latestInternal: null,
      }),
      buildCertificationWorkflowStatus({
        workflowKey: 'ags',
        latestInternal: null,
      }),
    ],
    latestOfficialCertificationEvidence: buildLatestOfficialCertificationEvidence({
      workflowKey: 'core',
      state: 'notCertified',
      checkedAt: '2026-03-24T12:55:00Z',
      summary: 'Latest recorded 1EdTech evidence does not show a certification listing.',
      directoryUrl: 'https://example.test/official-directory',
    }),
    ltiProfileSettings: {
      defaultLtiProfile: 'certification',
      updatedAt: '2026-03-24T13:00:00Z',
    },
  });

  assertStringIncludes(html, 'Saved checks');
  assertStringIncludes(html, 'Certification checklist');
  assertStringIncludes(html, 'Official 1EdTech listing');
  assertStringIncludes(html, 'LTI Core');
  assertStringIncludes(html, 'Deep Linking');
  assertStringIncludes(html, 'NRPS');
  assertStringIncludes(html, 'AGS');
  assertStringIncludes(html, 'Chapter 4 Asteroids Pilot Deployment');
  assertStringIncludes(html, 'Chapter 4 Asteroids Moodle Deployment');
  assertStringIncludes(html, 'Chapter 4 Asteroids Sakai Deployment');
  assertStringIncludes(html, 'Canvas deployment verification passed.');
  assertStringIncludes(html, 'Moodle deployment verification failed.');
  assertStringIncludes(html, 'A passed Core row does not cover Deep Linking, NRPS, or AGS.');
  assertStringIncludes(html, 'No internal evidence has been recorded for NRPS yet.');
  assertStringIncludes(html, 'Not certified');
  assertStringIncludes(html, 'https://example.test/internal-proof');
  assertStringIncludes(html, 'https://example.test/moodle-proof');
  assertStringIncludes(html, 'https://example.test/official-directory');
  assertStringIncludes(html, 'Add a check');
  assertStringIncludes(html, 'action="/admin/verification"');
  assertStringIncludes(html, 'Lantern default profile');
  assertStringIncludes(html, 'action="/admin/verification/lti-profile"');
  assertStringIncludes(html, 'Certification');
  assertStringIncludes(html, 'Governed interoperability');
  assertStringIncludes(html, 'name="deploymentRecordId"');
  assertStringIncludes(html, 'name="workflowKey"');
  assertStringIncludes(html, 'name="scope"');
  assertEquals(html.includes('Deployment inventory'), false);
  assertEquals(html.includes('Supported Canvas path'), false);
});
