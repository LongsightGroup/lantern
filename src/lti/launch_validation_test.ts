import { assertEquals, assertRejects } from "@std/assert";
import { validateLaunchRequest } from "./launch.ts";
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  buildSakaiDeploymentBinding,
  getTestCanvasJwks,
  signCanvasIdToken,
} from "../test_helpers/lti.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";

Deno.test("validateLaunchRequest accepts a signed launch with matching state, nonce, and deployment binding", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: "nonce-123",
    audience: "10000000000001",
  });
  const launch = await validateLaunchRequest({
    repository,
    state: "state-123",
    idToken,
    now: () => new Date("2026-03-23T22:45:00Z"),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });
  const loginState = await repository.getLoginStateByState("state-123");

  assertEquals(launch.deploymentId, "deployment-123");
  assertEquals(launch.clientId, "10000000000001");
  assertEquals(launch.appId, "chapter-4-asteroids");
  assertEquals(launch.packageVersionId, 1);
  assertEquals(loginState?.usedAt !== null, true);
});

Deno.test("validateLaunchRequest accepts a signed Sakai launch with matching state and deployment binding", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildSakaiDeploymentBinding({
          issuer: "https://sakai.example",
          clientId: "7dbe6a13-f948-498c-87d7-768947ac5c56",
          deploymentId: "1",
        }),
      }),
    ],
    loginStates: [buildLoginStateRecord({
      lms: "sakai",
      issuer: "https://sakai.example",
      clientId: "7dbe6a13-f948-498c-87d7-768947ac5c56",
      deploymentId: "1",
    })],
  });
  const idToken = await signCanvasIdToken({
    deploymentBinding: {
      issuer: "https://sakai.example",
      clientId: "7dbe6a13-f948-498c-87d7-768947ac5c56",
      deploymentId: "1",
    },
    nonce: "nonce-123",
    audience: "7dbe6a13-f948-498c-87d7-768947ac5c56",
  });
  const launch = await validateLaunchRequest({
    repository,
    state: "state-123",
    idToken,
    now: () => new Date("2026-03-23T22:45:00Z"),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(launch.lms, "sakai");
  assertEquals(launch.canvasEnvironment, null);
  assertEquals(launch.deploymentId, "1");
  assertEquals(launch.clientId, "7dbe6a13-f948-498c-87d7-768947ac5c56");
  assertEquals(launch.appId, "chapter-4-asteroids");
});

Deno.test("validateLaunchRequest rejects invalid signatures, mismatched target_link_uri, and unsupported message types", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 7,
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    loginStates: [
      buildLoginStateRecord(),
      buildLoginStateRecord({
        state: "state-target",
        nonce: "nonce-target",
      }),
      buildLoginStateRecord({
        state: "state-message",
        nonce: "nonce-message",
      }),
    ],
  });
  const targetMismatchToken = await signCanvasIdToken({
    nonce: "nonce-target",
    targetLinkUri: "http://localhost:8417/lti/runtime/chapter-4-asteroids",
  });
  const invalidSignatureToken = await signCanvasIdToken({
    nonce: "nonce-123",
  });
  const messageMismatchToken = await signCanvasIdToken({
    nonce: "nonce-message",
    messageType: "LtiDeepLinkingRequest",
  });

  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: "state-123",
        idToken: invalidSignatureToken,
        now: () => new Date("2026-03-23T22:45:00Z"),
        loadJwks: () => Promise.resolve({ keys: [] }),
      }),
    Error,
    "Launch id_token signature or issuer validation failed.",
  );
  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: "state-target",
        idToken: targetMismatchToken,
        now: () => new Date("2026-03-23T22:45:00Z"),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    Error,
    "Launch target_link_uri did not match the saved login state.",
  );
  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: "state-message",
        idToken: messageMismatchToken,
        now: () => new Date("2026-03-23T22:45:00Z"),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    Error,
    "Unsupported LTI message type LtiDeepLinkingRequest.",
  );

  const preservedState = await repository.getLoginStateByState("state-message");

  assertEquals(preservedState?.usedAt, null);
});
