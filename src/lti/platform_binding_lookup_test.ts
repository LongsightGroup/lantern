import { assertEquals, assertRejects } from '@std/assert';
import { resolveCanvasIssuer } from './config.ts';
import { createLoginRedirect } from './login.ts';
import {
  buildCanvasDeploymentBinding,
  buildCanvasLoginRequest,
  buildMoodleDeploymentBinding,
} from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('createLoginRedirect resolves the Canvas binding when another LMS shares the same platform tuple', async () => {
  const canvasIssuer = resolveCanvasIssuer('production');
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 2,
        slug: 'chapter-4-asteroids-moodle',
        binding: buildMoodleDeploymentBinding({
          issuer: canvasIssuer,
          clientId: 'shared-client-123',
          deploymentId: 'shared-deployment-123',
        }),
      }),
      buildDeploymentRecord({
        id: 1,
        slug: 'chapter-4-asteroids-canvas',
        binding: buildCanvasDeploymentBinding({
          canvasEnvironment: 'production',
          issuer: canvasIssuer,
          clientId: 'shared-client-123',
          deploymentId: 'shared-deployment-123',
        }),
      }),
    ],
  });

  const result = await createLoginRedirect({
    repository,
    loginRequest: buildCanvasLoginRequest({
      iss: canvasIssuer,
      clientId: 'shared-client-123',
      deploymentId: 'shared-deployment-123',
    }),
    now: () => new Date('2026-03-26T11:05:00Z'),
    createOpaqueToken: () => crypto.randomUUID(),
  });

  assertEquals(result.loginState.lms, 'canvas');
  assertEquals(result.loginState.canvasEnvironment, 'production');
});

Deno.test('createLoginRedirect rejects a Moodle-only binding because login initiation remains Canvas-specific', async () => {
  const canvasIssuer = resolveCanvasIssuer('production');
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 2,
        slug: 'chapter-4-asteroids-moodle',
        binding: buildMoodleDeploymentBinding({
          issuer: canvasIssuer,
          clientId: 'shared-client-123',
          deploymentId: 'shared-deployment-123',
        }),
      }),
    ],
  });

  await assertRejects(
    () =>
      createLoginRedirect({
        repository,
        loginRequest: buildCanvasLoginRequest({
          iss: canvasIssuer,
          clientId: 'shared-client-123',
          deploymentId: 'shared-deployment-123',
        }),
      }),
    Error,
    'Canvas deployment shared-client-123 / shared-deployment-123 was not found',
  );
});
