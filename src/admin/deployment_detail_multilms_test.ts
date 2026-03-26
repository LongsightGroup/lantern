import { assertStringIncludes } from '@std/assert';
import { resolveCanvasIssuer } from '../lti/config.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import {
  buildCanvasDeploymentBinding,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
} from '../test_helpers/lti.ts';
import { renderDeploymentDetailPage } from './deployment_detail.ts';

Deno.test('deployment page renders separate Canvas, Moodle, and Sakai cards for one app', () => {
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    history: [
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
        reviewedAt: '2026-03-24T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: 'chapter-4-asteroids-pilot',
        label: 'Chapter 4 Asteroids Pilot Deployment',
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildCanvasDeploymentBinding(),
      }),
      buildDeploymentRecord({
        id: 4,
        slug: 'chapter-4-asteroids-moodle',
        label: 'Chapter 4 Asteroids Moodle Deployment',
        enabledPackageVersionId: null,
        enabledPackageVersion: null,
        binding: buildMoodleDeploymentBinding(),
      }),
      buildDeploymentRecord({
        id: 5,
        slug: 'chapter-4-asteroids-sakai',
        label: 'Chapter 4 Asteroids Sakai Deployment',
        enabledPackageVersionId: 2,
        enabledPackageVersion: '0.2.0',
        binding: buildSakaiDeploymentBinding(),
      }),
    ],
    canvasConfigUrl: 'http://localhost:8000/lti/canvas/config.json',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Canvas deployment');
  assertStringIncludes(html, 'Moodle deployment');
  assertStringIncludes(html, 'Sakai deployment');
  assertStringIncludes(html, 'chapter-4-asteroids-pilot');
  assertStringIncludes(html, 'chapter-4-asteroids-moodle');
  assertStringIncludes(html, 'chapter-4-asteroids-sakai');
  assertStringIncludes(html, 'Pinned to version 0.1.0.');
  assertStringIncludes(html, 'Pinned to version 0.2.0.');
  assertStringIncludes(html, 'No reviewed version is pinned yet.');
  assertStringIncludes(html, 'name="lms" value="canvas"');
  assertStringIncludes(html, 'name="lms" value="moodle"');
  assertStringIncludes(html, 'name="lms" value="sakai"');
});
