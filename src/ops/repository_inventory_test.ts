import { assertEquals } from '@std/assert';
import { mapInventoryRow } from './repository_mapping.ts';
import { buildInventoryQueryRow } from './repository_inventory_test_support.ts';

Deno.test('ops inventory mapping keeps exact Canvas, Moodle, and Sakai bindings legible in shared control-plane rows', () => {
  const canvasInventory = mapInventoryRow(
    buildInventoryQueryRow({
      bindingLmsType: 'canvas',
      bindingCanvasEnvironment: 'production',
      bindingIssuer: 'https://canvas.instructure.com',
      bindingClientId: '10000000000001',
      bindingDeploymentId: 'canvas-deployment-123',
    }),
    null,
  );
  const moodleInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 2,
      deploymentSlug: 'chapter-4-asteroids-moodle',
      deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
      bindingLmsType: 'moodle',
      bindingCanvasEnvironment: null,
      bindingIssuer: 'https://moodle.example',
      bindingClientId: 'moodle-client-123',
      bindingDeploymentId: 'moodle-deployment-123',
      bindingAuthorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
      bindingAccessTokenUrl: 'https://moodle.example/mod/lti/token.php',
      bindingJwksUrl: 'https://moodle.example/mod/lti/certs.php',
    }),
    null,
  );
  const sakaiInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 3,
      deploymentSlug: 'chapter-4-asteroids-sakai',
      deploymentLabel: 'Chapter 4 Asteroids Sakai Deployment',
      bindingLmsType: 'sakai',
      bindingCanvasEnvironment: null,
      bindingIssuer: 'https://sakai.example',
      bindingClientId: 'sakai-client-123',
      bindingDeploymentId: 'sakai-deployment-123',
      bindingAuthorizationEndpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
      bindingAccessTokenUrl: 'https://sakai.example/imsblis/lti13/token/3',
      bindingJwksUrl: 'https://sakai.example/imsblis/lti13/keyset',
    }),
    null,
  );

  assertEquals(canvasInventory.binding, {
    lms: 'canvas',
    canvasEnvironment: 'production',
    issuer: 'https://canvas.instructure.com',
    clientId: '10000000000001',
    deploymentId: 'canvas-deployment-123',
  });
  assertEquals(moodleInventory.binding, {
    lms: 'moodle',
    issuer: 'https://moodle.example',
    clientId: 'moodle-client-123',
    deploymentId: 'moodle-deployment-123',
    authorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
    accessTokenUrl: 'https://moodle.example/mod/lti/token.php',
    jwksUrl: 'https://moodle.example/mod/lti/certs.php',
  });
  assertEquals(sakaiInventory.binding, {
    lms: 'sakai',
    issuer: 'https://sakai.example',
    clientId: 'sakai-client-123',
    deploymentId: 'sakai-deployment-123',
    authorizationEndpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
    accessTokenUrl: 'https://sakai.example/imsblis/lti13/token/3',
    jwksUrl: 'https://sakai.example/imsblis/lti13/keyset',
  });
  assertEquals(
    canvasInventory.health.dimensions.enablement.summary,
    'Deployment pin and Canvas binding are present.',
  );
  assertEquals(
    moodleInventory.health.dimensions.enablement.summary,
    'Deployment pin and Moodle binding are present.',
  );
  assertEquals(
    sakaiInventory.health.dimensions.enablement.summary,
    'Deployment pin and Sakai binding are present.',
  );
});

Deno.test('ops inventory health keeps broker verification wording deployment-scoped across canvas, moodle, and sakai', () => {
  const canvasInventory = mapInventoryRow(
    buildInventoryQueryRow({
      internalBrokerVerificationScope: 'lti13LaunchAgsNrps',
      internalBrokerVerificationSource: 'manual',
      internalBrokerVerificationStatus: 'passed',
      internalBrokerVerificationSummary:
        'Canvas launch, AGS publish, and NRPS verification passed.',
      internalBrokerVerificationCheckedAt: '2026-03-24T12:50:00Z',
    }),
  );
  const moodleInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 2,
      deploymentSlug: 'chapter-4-asteroids-moodle',
      deploymentLabel: 'Chapter 4 Asteroids Moodle Deployment',
      bindingLmsType: 'moodle',
      bindingCanvasEnvironment: null,
      bindingIssuer: 'https://moodle.example',
      bindingClientId: 'moodle-client-123',
      bindingDeploymentId: 'moodle-deployment-123',
      bindingAuthorizationEndpoint: 'https://moodle.example/mod/lti/auth.php',
      bindingAccessTokenUrl: 'https://moodle.example/mod/lti/token.php',
      bindingJwksUrl: 'https://moodle.example/mod/lti/certs.php',
      internalBrokerVerificationScope: 'lti13LaunchAgsScore',
      internalBrokerVerificationSource: 'ci',
      internalBrokerVerificationStatus: 'failed',
      internalBrokerVerificationSummary:
        'Latest Moodle CI verification failed on the AGS score publish.',
      internalBrokerVerificationCheckedAt: '2026-03-24T13:10:00Z',
    }),
  );
  const sakaiInventory = mapInventoryRow(
    buildInventoryQueryRow({
      deploymentId: 3,
      deploymentSlug: 'chapter-4-asteroids-sakai',
      deploymentLabel: 'Chapter 4 Asteroids Sakai Deployment',
      bindingLmsType: 'sakai',
      bindingCanvasEnvironment: null,
      bindingIssuer: 'https://sakai.example',
      bindingClientId: 'sakai-client-123',
      bindingDeploymentId: 'sakai-deployment-123',
      bindingAuthorizationEndpoint: 'https://sakai.example/imsoidc/lti13/oidc_auth',
      bindingAccessTokenUrl: 'https://sakai.example/imsblis/lti13/token/3',
      bindingJwksUrl: 'https://sakai.example/imsblis/lti13/keyset',
      internalBrokerVerificationScope: 'lti13LaunchAgsScore',
      internalBrokerVerificationSource: 'manual',
      internalBrokerVerificationStatus: 'pending',
      internalBrokerVerificationSummary:
        'Sakai launch and AGS smoke verification is pending follow-up.',
      internalBrokerVerificationCheckedAt: '2026-03-24T13:20:00Z',
    }),
  );

  assertEquals(
    canvasInventory.health.dimensions.brokerVerification.summary,
    'Latest deployment-scoped broker verification passed.',
  );
  assertEquals(
    moodleInventory.health.dimensions.brokerVerification.summary,
    'Latest deployment-scoped broker verification failed.',
  );
  assertEquals(
    sakaiInventory.health.dimensions.brokerVerification.summary,
    'Deployment-scoped broker verification is still pending.',
  );
});
