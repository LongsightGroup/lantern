import { assertFalse, assertStringIncludes } from '@std/assert';
import { resolveCanvasIssuer } from '../lti/config.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import {
  buildCanvasDeploymentBinding,
  buildDeploymentBinding,
  buildSakaiDeploymentBinding,
} from '../test_helpers/lti.ts';
import { renderDeploymentDetailPage } from './deployment_detail.ts';

Deno.test('deployment page keeps shared copy neutral while scoping Canvas, Moodle, and Sakai setup into tabs', () => {
  const binding = buildCanvasDeploymentBinding();
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding,
      }),
    ],
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    canvasDynamicRegistrationUrl:
      'http://localhost:8417/admin/packages/chapter-4-asteroids/deployment/register/canvas',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Managed LMS deployment');
  assertStringIncludes(html, 'Open one LMS slot at a time.');
  assertStringIncludes(html, 'deployment-tab-strip');
  assertStringIncludes(html, 'Canvas editor');
  assertStringIncludes(html, 'Dynamic registration');
  assertStringIncludes(
    html,
    'http://localhost:8417/admin/packages/chapter-4-asteroids/deployment/register/canvas',
  );
  assertStringIncludes(html, 'deployment-tab-label">Moodle</span>');
  assertStringIncludes(html, 'deployment-tab-label">Sakai</span>');
  assertFalse(
    html.includes(
      'Pin the reviewed version, then wire this deployment into Canvas through one supported LTI 1.3 path.',
    ),
  );
  assertStringIncludes(html, 'Config URL');
  assertStringIncludes(html, 'Canvas environment');
  assertStringIncludes(html, binding.issuer);
  assertStringIncludes(html, 'Deployment-scoped operational evidence.');
  assertStringIncludes(html, 'Show install, launch, verification, and diagnostic detail');
});

Deno.test('deployment page renders the selected Sakai tab without leaking the Canvas form', () => {
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
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildSakaiDeploymentBinding(),
        lmsType: 'sakai',
      }),
    ],
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    sakaiDynamicRegistrationUrl:
      'http://localhost:8417/admin/packages/chapter-4-asteroids/deployment/register/sakai',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(
    html,
    'href="/admin/packages/chapter-4-asteroids/deployment?lms=sakai#slot-panel" aria-current="page"',
  );
  assertStringIncludes(html, 'Sakai setup');
  assertStringIncludes(html, 'Dynamic registration');
  assertStringIncludes(html, 'Tool configuration URL');
  assertStringIncludes(
    html,
    'http://localhost:8417/admin/packages/chapter-4-asteroids/deployment/register/sakai',
  );
  assertStringIncludes(html, 'Authorization endpoint');
  assertStringIncludes(html, 'Public keyset URL');
  assertFalse(html.includes('Canvas environment'));
  assertFalse(html.includes('Config URL'));
});

Deno.test('deployment page shows the Canvas pending-registration state before the first launch seals deployment_id', () => {
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        lmsType: 'canvas',
        binding: null,
      }),
    ],
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    canvasDynamicRegistrationUrl:
      'http://localhost:8417/admin/packages/chapter-4-asteroids/deployment/register/canvas',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Canvas registration saved, first launch still needed');
  assertStringIncludes(html, 'Pending Canvas registration');
  assertStringIncludes(html, 'one real Canvas launch to capture the exact');
  assertStringIncludes(html, 'Save release pin');
});

Deno.test('deployment page shows the latest roster verification summary and action', () => {
  const html = renderDeploymentDetailPage({
    appId: 'chapter-4-asteroids',
    appTitle: 'Chapter 4 Asteroids',
    history: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: 'approved',
        reviewedAt: '2026-03-23T18:05:00Z',
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        enabledPackageVersionId: 1,
        enabledPackageVersion: '0.1.0',
        binding: buildDeploymentBinding(),
      }),
    ],
    nrpsVerification: {
      status: 'succeeded',
      checkedAt: '2026-03-24T03:05:00Z',
      contextId: 'course-42',
      memberCount: 2,
    },
    canvasConfigUrl: 'http://localhost:8417/lti/canvas/config.json',
    supportedCanvasEnvironments: [
      {
        id: 'production',
        label: 'Production Canvas',
        issuer: resolveCanvasIssuer('production'),
      },
    ],
  });

  assertStringIncludes(html, 'Canvas service check');
  assertStringIncludes(html, 'Succeeded');
  assertStringIncludes(html, 'Run roster check');
  assertStringIncludes(html, 'course-42');
  assertStringIncludes(html, '2');
});
