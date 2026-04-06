import { assertEquals, assertRejects } from '@std/assert';
import { resolveCanvasIssuer } from './config.ts';
import { createLoginRedirect } from './login.ts';
import {
  buildCanvasDeploymentBinding,
  buildCanvasLoginRequest,
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
  buildSakaiLoginRequest,
} from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';

Deno.test('createLoginRedirect rejects an ambiguous platform tuple shared across LMS slots', async () => {
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
    'Choose one supported LMS deployment.',
  );
});

Deno.test('createLoginRedirect resolves a Sakai-only binding through shared platform identity lookup', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 2,
        slug: 'chapter-4-asteroids-sakai',
        binding: buildSakaiDeploymentBinding({
          issuer: 'https://sakai.example',
          clientId: 'sakai-client-123',
          deploymentId: '1',
        }),
      }),
    ],
  });

  const result = await createLoginRedirect({
    repository,
    loginRequest: buildSakaiLoginRequest({
      iss: 'https://sakai.example',
      clientId: 'sakai-client-123',
      deploymentId: '1',
    }),
  });

  assertEquals(result.loginState.lms, 'sakai');
  assertEquals(result.loginState.canvasEnvironment, null);
  assertEquals(
    new URL(result.location).origin + new URL(result.location).pathname,
    'https://sakai.example/imsoidc/lti13/oidc_auth',
  );
});
