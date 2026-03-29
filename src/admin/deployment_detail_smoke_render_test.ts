import { assertFalse, assertStringIncludes } from '@std/assert';
import { resolveCanvasIssuer } from '../lti/config.ts';
import {
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildDeploymentActivitySnapshot,
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import { buildMoodleDeploymentBinding, buildSakaiDeploymentBinding } from '../test_helpers/lti.ts';
import { renderDeploymentDetailPage } from './deployment_detail.ts';

Deno.test('deployment page shows the latest Moodle grade-return result with plain-language check facts', () => {
  const smokeLineItemUrl = 'https://moodle.example/mod/lti/services.php/2/lineitems/9';
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    selectedLms: 'moodle',
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 4,
        slug: 'chapter-4-asteroids-moodle',
        label: 'Chapter 4 Asteroids Moodle Deployment',
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        lmsType: 'moodle',
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
    controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
      inventory: buildControlPlaneDeploymentInventoryRow({
        deploymentId: 4,
        deploymentSlug: 'chapter-4-asteroids-moodle',
        deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
        binding: buildMoodleDeploymentBinding(),
      }),
      latestAgsSmoke: buildDeploymentActivitySnapshot({
        status: 'succeeded',
        summary: 'Moodle grade return check passed.',
        detail: {
          lms: 'moodle',
          agsCapable: true,
          publicationStatus: 'succeeded',
          lineItemUrl: smokeLineItemUrl,
          error: null,
        },
      }),
    }),
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Latest grade return check');
  assertStringIncludes(html, 'Grade return access');
  assertStringIncludes(html, 'Test write');
  assertStringIncludes(html, 'Run grade return check');
  assertStringIncludes(html, smokeLineItemUrl);
});

Deno.test('deployment page shows the latest Sakai grade-return result with plain-language check facts', () => {
  const smokeLineItemUrl = 'https://sakai.example/direct/lti/lineitems/course-42/items/9';
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    selectedLms: 'sakai',
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 5,
        slug: 'chapter-4-asteroids-sakai',
        label: 'Chapter 4 Asteroids Sakai Deployment',
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        lmsType: 'sakai',
        binding: buildSakaiDeploymentBinding(),
      }),
    ],
    controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
      inventory: buildControlPlaneDeploymentInventoryRow({
        deploymentId: 5,
        deploymentSlug: 'chapter-4-asteroids-sakai',
        deploymentLabel: 'Chapter 4 Asteroids Sakai Deployment',
        binding: buildSakaiDeploymentBinding(),
      }),
      latestAgsSmoke: buildDeploymentActivitySnapshot({
        status: 'succeeded',
        summary: 'Sakai grade return check passed.',
        detail: {
          lms: 'sakai',
          agsCapable: true,
          publicationStatus: 'succeeded',
          lineItemUrl: smokeLineItemUrl,
          error: null,
        },
      }),
    }),
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Latest grade return check');
  assertStringIncludes(html, 'Grade return access');
  assertStringIncludes(html, 'Test write');
  assertStringIncludes(html, 'Run grade return check');
  assertStringIncludes(html, smokeLineItemUrl);
});

Deno.test('deployment page keeps failed smoke rendering bounded and readable on the existing detail page', () => {
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    selectedLms: 'moodle',
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 4,
        slug: 'chapter-4-asteroids-moodle',
        label: 'Chapter 4 Asteroids Moodle Deployment',
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        lmsType: 'moodle',
        binding: buildMoodleDeploymentBinding(),
      }),
    ],
    controlPlaneDetail: buildControlPlaneDeploymentDetailSnapshot({
      inventory: buildControlPlaneDeploymentInventoryRow({
        deploymentId: 4,
        deploymentSlug: 'chapter-4-asteroids-moodle',
        deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
        binding: buildMoodleDeploymentBinding(),
      }),
      latestAgsSmoke: buildDeploymentActivitySnapshot({
        status: 'failed',
        summary: 'Moodle grade return check failed.',
        detail: {
          lms: 'moodle',
          agsCapable: true,
          publicationStatus: 'not_attempted',
          lineItemUrl: null,
          error: {
            code: 'token_request_failed',
            message: 'simulated token failure',
          },
          accessToken: 'should-not-render',
        },
      }),
    }),
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Latest grade return check');
  assertStringIncludes(html, 'token_request_failed');
  assertStringIncludes(html, 'simulated token failure');
  assertFalse(html.includes('should-not-render'));
});
