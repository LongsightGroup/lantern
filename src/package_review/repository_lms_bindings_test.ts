import { assertEquals, assertRejects } from '@std/assert';
import { resolveCanvasIssuer } from '../lti/config.ts';
import { withRepositoryTestDatabase } from './repository_test_support.ts';

Deno.test('repository persists exact Canvas, Moodle, and Sakai bindings and lists them per app', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const canvasIssuer = resolveCanvasIssuer('production');
    const canvas = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-canvas',
      label: 'Chapter 4 Asteroids Canvas',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'canvas',
        canvasEnvironment: 'production',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
      },
    });
    const moodle = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-moodle',
      label: 'Chapter 4 Asteroids Moodle',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'moodle',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
        authorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
        accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
        jwksUrl: 'https://moodle.example/mod/lti/certs.php',
      },
    });
    const sakai = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-sakai',
      label: 'Chapter 4 Asteroids Sakai',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'sakai',
        issuer: 'https://sakai.example',
        clientId: 'sakai-client-123',
        deploymentId: 'sakai-deployment-123',
        authorizationEndpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
        accessTokenUrl: 'https://sakai.example/imsblis/lti13/token/3',
        jwksUrl: 'https://sakai.example/imsblis/lti13/keyset',
      },
    });

    assertEquals(canvas.binding?.lms, 'canvas');
    assertEquals(moodle.binding?.lms, 'moodle');
    assertEquals(
      moodle.binding?.lms === 'moodle' ? moodle.binding.authorizationEndpoint : null,
      'https://moodle.example/mod/lti/auth.php',
    );
    assertEquals(sakai.binding?.lms, 'sakai');
    assertEquals(
      sakai.binding?.lms === 'sakai' ? sakai.binding.authorizationEndpoint : null,
      'https://sakai.example/imsoidc/lti13/oidc_auth',
    );

    const listed = await repository.listDeploymentsByApp('chapter-4-asteroids');

    assertEquals(listed.map((deployment) => deployment.slug).sort(), [
      'chapter-4-asteroids-canvas',
      'chapter-4-asteroids-moodle',
      'chapter-4-asteroids-sakai',
    ]);
  });
});

Deno.test('repository uses exact LMS binding identity for lookup and rejects same-LMS slot collisions', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const canvasIssuer = resolveCanvasIssuer('production');

    await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-canvas',
      label: 'Chapter 4 Asteroids Canvas',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'canvas',
        canvasEnvironment: 'production',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
      },
    });
    await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-moodle',
      label: 'Chapter 4 Asteroids Moodle',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'moodle',
        issuer: canvasIssuer,
        clientId: 'shared-client-123',
        deploymentId: 'shared-deployment-123',
        authorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
        accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
        jwksUrl: 'https://moodle.example/mod/lti/certs.php',
      },
    });

    const canvas = await repository.getDeploymentByBinding({
      lms: 'canvas',
      issuer: canvasIssuer,
      clientId: 'shared-client-123',
      deploymentId: 'shared-deployment-123',
    });
    const moodle = await repository.getDeploymentByBinding({
      lms: 'moodle',
      issuer: canvasIssuer,
      clientId: 'shared-client-123',
      deploymentId: 'shared-deployment-123',
    });

    assertEquals(canvas?.slug, 'chapter-4-asteroids-canvas');
    assertEquals(moodle?.slug, 'chapter-4-asteroids-moodle');

    await assertRejects(
      () =>
        repository.saveDeploymentBinding({
          slug: 'chapter-4-asteroids-canvas-secondary',
          label: 'Chapter 4 Asteroids Canvas Secondary',
          appId: 'chapter-4-asteroids',
          binding: {
            lms: 'canvas',
            canvasEnvironment: 'beta',
            issuer: resolveCanvasIssuer('beta'),
            clientId: 'other-client-456',
            deploymentId: 'other-deployment-456',
          },
        }),
      Error,
      'App chapter-4-asteroids already has a canvas deployment.',
    );
  });
});
