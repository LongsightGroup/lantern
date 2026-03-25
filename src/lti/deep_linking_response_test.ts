import { assertEquals, assertExists } from '@std/assert';
import { createLocalJWKSet, jwtVerify } from 'jose';
import {
  buildDeepLinkingResponseSubmission,
  buildReviewedPlacementLineItemResourceId,
} from './deep_linking_response.ts';
import { LANTERN_PLACEMENT_CUSTOM_KEY, LTI_DEEP_LINKING_RESPONSE_MESSAGE_TYPE } from './types.ts';
import {
  buildDeepLinkingSessionRecord,
  buildDeploymentBinding,
  getTestToolPrivateJwkEnvValue,
} from '../test_helpers/lti.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildReviewedPlacementRecord,
} from '../test_helpers/package_review.ts';
import { getPublicJwkSet } from './tool_key.ts';

Deno.test('deep linking response builder signs one LtiDeepLinkingResponse JWT and echoes the saved data claim', async () => {
  const deploymentBinding = buildDeploymentBinding();
  const response = await buildDeepLinkingResponseSubmission({
    session: buildDeepLinkingSessionRecord({
      data: 'deep-linking-state-token',
    }),
    deployment: buildDeploymentRecord({
      binding: deploymentBinding,
    }),
    placement: buildReviewedPlacementRecord(),
    packageVersion: buildPackageVersionRecord({
      installScope: 'assignment',
    }),
    appOrigin: 'https://lantern.example',
    now: () => new Date('2026-03-24T18:30:00Z'),
    env: buildResponseEnv(),
  });
  const verified = await verifyResponseJwt(
    response.jwt,
    deploymentBinding,
    new Date('2026-03-24T18:31:00Z'),
  );

  assertEquals(response.returnUrl.includes('deep_link_return'), true);
  assertEquals(response.formFields.JWT, response.jwt);
  assertEquals(verified.payload.iss, deploymentBinding.clientId);
  assertEquals(verified.payload.sub, deploymentBinding.clientId);
  assertEquals(verified.payload.aud, deploymentBinding.issuer);
  assertEquals(
    verified.payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
    deploymentBinding.deploymentId,
  );
  assertEquals(
    verified.payload['https://purl.imsglobal.org/spec/lti/claim/message_type'],
    LTI_DEEP_LINKING_RESPONSE_MESSAGE_TYPE,
  );
  assertEquals(verified.payload['https://purl.imsglobal.org/spec/lti/claim/version'], '1.3.0');
  assertEquals(
    verified.payload['https://purl.imsglobal.org/spec/lti-dl/claim/data'],
    'deep-linking-state-token',
  );
});

Deno.test("deep linking response builder returns one launch content item with Lantern's singular launch URL and placement key", async () => {
  const placement = buildReviewedPlacementRecord({
    placementId: 'placement-456',
    contentTitle: 'Bonus Activity',
  });
  const response = await buildDeepLinkingResponseSubmission({
    session: buildDeepLinkingSessionRecord({
      data: null,
    }),
    deployment: buildDeploymentRecord({
      binding: buildDeploymentBinding(),
    }),
    placement,
    packageVersion: buildPackageVersionRecord({
      installScope: 'assignment',
    }),
    appOrigin: 'https://lantern.example',
    env: buildResponseEnv(),
  });
  const verified = await verifyResponseJwt(
    response.jwt,
    buildDeploymentBinding(),
    new Date('2026-03-24T18:31:00Z'),
  );
  const contentItems = verified.payload[
    'https://purl.imsglobal.org/spec/lti-dl/claim/content_items'
  ] as Array<Record<string, unknown>>;
  const contentItem = contentItems[0];

  assertExists(contentItem);
  assertEquals(contentItems.length, 1);
  assertEquals(contentItem.type, 'ltiResourceLink');
  assertEquals(contentItem.title, 'Bonus Activity');
  assertEquals(contentItem.url, 'https://lantern.example/lti/launch');
  assertEquals(
    (contentItem.custom as Record<string, unknown>)[LANTERN_PLACEMENT_CUSTOM_KEY],
    'placement-456',
  );
  assertEquals(
    typeof (contentItem.custom as Record<string, unknown>)[LANTERN_PLACEMENT_CUSTOM_KEY],
    'string',
  );
});

Deno.test('deep linking response builder derives optional line-item metadata from reviewed package facts', async () => {
  const placement = buildReviewedPlacementRecord({
    placementId: 'placement-line-item',
    packageVersion: '0.2.0',
    contentTitle: 'Bonus Activity',
    activityId: '/content/bonus.json',
    contentPath: '/content/bonus.json',
  });
  const packageVersion = buildPackageVersionRecord({
    version: '0.2.0',
    installScope: 'assignment',
    grading: {
      mode: 'declarative',
      rubricFile: '/scoring/rubric.json',
      maxScore: 25,
    },
  });
  const response = await buildDeepLinkingResponseSubmission({
    session: buildDeepLinkingSessionRecord({
      acceptLineItem: true,
    }),
    deployment: buildDeploymentRecord({
      binding: buildDeploymentBinding(),
    }),
    placement,
    packageVersion,
    appOrigin: 'https://lantern.example',
    env: buildResponseEnv(),
  });
  const verified = await verifyResponseJwt(
    response.jwt,
    buildDeploymentBinding(),
    new Date('2026-03-24T18:31:00Z'),
  );
  const contentItems = verified.payload[
    'https://purl.imsglobal.org/spec/lti-dl/claim/content_items'
  ] as Array<Record<string, unknown>>;
  const lineItem = contentItems[0]?.lineItem as Record<string, unknown>;

  assertExists(lineItem);
  assertEquals(lineItem.label, 'Bonus Activity');
  assertEquals(lineItem.scoreMaximum, 25);
  assertEquals(lineItem.tag, 'final-grade');
  assertEquals(lineItem.resourceId, buildReviewedPlacementLineItemResourceId(placement));
});

function buildResponseEnv(): { get(name: string): string | undefined } {
  const privateJwk = getTestToolPrivateJwkEnvValue();

  return {
    get(name: string) {
      return name === 'LTI_TOOL_PRIVATE_JWK' ? privateJwk : undefined;
    },
  };
}

async function verifyResponseJwt(
  jwt: string,
  binding: ReturnType<typeof buildDeploymentBinding>,
  currentDate: Date,
) {
  const keySet = createLocalJWKSet(await getPublicJwkSet(buildResponseEnv()));

  return await jwtVerify(jwt, keySet, {
    issuer: binding.clientId,
    audience: binding.issuer,
    currentDate,
  });
}
