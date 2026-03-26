import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { resolveCanvasIssuer } from './lti/config.ts';
import {
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildDeploymentActivitySnapshot,
  buildDeploymentGradePublicationSnapshot,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildPilotUsageMetrics,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildDeploymentBinding } from './test_helpers/lti.ts';
import { restoreEnv } from './app_test_support.ts';

Deno.test('POST /admin/packages/:appId/deployment/install saves the Canvas binding and redirects back to deployment detail', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'http://localhost:8000');

  try {
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
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });
    const formData = new FormData();

    formData.set('lms', 'canvas');
    formData.set('canvasEnvironment', 'production');
    formData.set('clientId', '10000000000001');
    formData.set('deploymentId', 'deployment-123');

    const response = await app.request(
      'http://localhost/admin/packages/chapter-4-asteroids/deployment/install',
      {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
        body: formData,
      },
    );

    assertEquals(response.status, 303);
    assertEquals(
      response.headers.get('location'),
      '/admin/packages/chapter-4-asteroids/deployment',
    );

    const deployment = await repository.getDeploymentBySlug('chapter-4-asteroids-pilot');
    assertEquals(deployment?.binding?.issuer, resolveCanvasIssuer('production'));
    assertEquals(deployment?.binding?.clientId, '10000000000001');
    assertEquals(deployment?.binding?.deploymentId, 'deployment-123');
    const auditEvents = await repository.listAuditEventsByEventType('deployment.binding_saved');
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.deploymentRecordId, 3);
    assertEquals(auditEvents[0]?.detail.lms, 'canvas');
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});

Deno.test('GET /admin/packages/:appId/deployment renders the Canvas, Moodle, and Sakai deployment cards', async () => {
  const previousOrigin = Deno.env.get('APP_ORIGIN');
  Deno.env.set('APP_ORIGIN', 'http://localhost:8000');

  try {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
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
          controlPlaneDeploymentDetails: [
            buildControlPlaneDeploymentDetailSnapshot({
              inventory: buildControlPlaneDeploymentInventoryRow({
                deploymentId: 3,
                enabledPackageVersionId: 5,
                enabledPackageVersion: '0.1.0',
                binding: buildDeploymentBinding(),
              }),
              latestLaunch: buildDeploymentActivitySnapshot({
                occurredAt: '2026-03-24T12:30:00Z',
                summary: 'Latest launch reached the governed runtime handoff.',
              }),
              latestNrpsRead: buildDeploymentActivitySnapshot({
                occurredAt: '2026-03-24T12:33:00Z',
                summary: 'Latest roster verification succeeded.',
              }),
              latestGradePublish: buildDeploymentGradePublicationSnapshot({
                updatedAt: '2026-03-24T12:35:00Z',
                status: 'failed',
              }),
              pilotUsage: buildPilotUsageMetrics({
                totalLaunches: 6,
                attemptsCompleted: 5,
                gradePublishesSucceeded: 4,
                gradePublishesFailed: 1,
                recentActiveUsers: 3,
              }),
            }),
          ],
        }),
    }).request('http://localhost/admin/packages/chapter-4-asteroids/deployment');

    assertEquals(response.status, 200);
    const body = await response.text();

    assertStringIncludes(body, 'Managed LMS deployment');
    assertStringIncludes(body, 'Canvas deployment');
    assertStringIncludes(body, 'Moodle deployment');
    assertStringIncludes(body, 'Sakai deployment');
    assertStringIncludes(body, 'Config URL');
    assertStringIncludes(body, 'Authentication request URL');
    assertStringIncludes(body, 'OIDC authentication URL');
    assertStringIncludes(body, 'Public keyset URL');
    assertStringIncludes(body, 'Canvas Client ID');
    assertStringIncludes(body, 'Launch-ready configuration saved');
    assertStringIncludes(body, 'Current status');
    assertStringIncludes(body, 'Last launch');
    assertStringIncludes(body, 'Last AGS write');
    assertStringIncludes(body, 'Last NRPS read');
    assertStringIncludes(body, 'Pilot usage');
    assertStringIncludes(body, 'Grade publishes');
    assertStringIncludes(body, 'Save exact Moodle binding');
    assertStringIncludes(body, 'Save exact Sakai binding');
    assertStringIncludes(body, 'Save exact version pin');
  } finally {
    restoreEnv('APP_ORIGIN', previousOrigin);
  }
});
