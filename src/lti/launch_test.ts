import { assertEquals, assertRejects } from "@std/assert";
import { createRuntimeSession, validateLaunchRequest } from "./launch.ts";
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  buildRuntimeSessionRecord,
  buildValidatedLaunch,
  getTestCanvasJwks,
  signCanvasIdToken,
} from "../test_helpers/lti.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildReviewedPlacementRecord,
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
    targetLinkUri: "http://localhost:8000/lti/runtime/chapter-4-asteroids",
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

Deno.test("validateLaunchRequest resolves reviewed placements from the launch custom claim and binds the first Canvas resource link", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        installScope: "assignment",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:10:00Z",
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
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: "placement-123",
        deploymentRecordId: 7,
        packageVersionId: 2,
        packageVersion: "0.2.0",
        activityId: "/content/bonus.json",
        contentPath: "/content/bonus.json",
        contentTitle: "Bonus Activity",
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: "nonce-123",
    audience: "10000000000001",
    resourceLinkId: "resource-link-reviewed",
    custom: {
      lantern_placement_id: "placement-123",
    },
  });
  const launch = await validateLaunchRequest({
    repository,
    state: "state-123",
    idToken,
    now: () => new Date("2026-03-23T22:45:00Z"),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });
  const placement = await repository.getReviewedPlacementById("placement-123");

  assertEquals(launch.packageVersionId, 2);
  assertEquals(launch.packageVersion, "0.2.0");
  assertEquals(launch.activityId, "/content/bonus.json");
  assertEquals(
    (launch as unknown as Record<string, unknown>).contentPath,
    "/content/bonus.json",
  );
  assertEquals(placement?.resourceLinkId, "resource-link-reviewed");
  assertEquals(placement?.boundAt, "2026-03-23T22:45:00.000Z");
});

Deno.test("validateLaunchRequest rejects reviewed placement launches when the Canvas resource link does not match the bound placement", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        installScope: "assignment",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:10:00Z",
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
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: "placement-123",
        deploymentRecordId: 7,
        packageVersionId: 2,
        packageVersion: "0.2.0",
        activityId: "/content/bonus.json",
        contentPath: "/content/bonus.json",
        resourceLinkId: "resource-link-reviewed",
        boundAt: "2026-03-23T22:40:00Z",
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: "nonce-123",
    audience: "10000000000001",
    resourceLinkId: "resource-link-other",
    custom: {
      lantern_placement_id: "placement-123",
    },
  });

  await assertRejects(
    () =>
      validateLaunchRequest({
        repository,
        state: "state-123",
        idToken,
        now: () => new Date("2026-03-23T22:45:00Z"),
        loadJwks: () => Promise.resolve(getTestCanvasJwks()),
      }),
    Error,
    "Reviewed placement placement-123 is already bound to Canvas resource link resource-link-reviewed.",
  );

  const loginState = await repository.getLoginStateByState("state-123");

  assertEquals(loginState?.usedAt, null);
});

Deno.test("validateLaunchRequest keeps the deployment-pin runtime path for launches without reviewed placement keys", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:10:00Z",
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
  const launch = await validateLaunchRequest({
    repository,
    state: "state-123",
    idToken: await signCanvasIdToken({
      nonce: "nonce-123",
      audience: "10000000000001",
      resourceLinkId: "resource-link-legacy",
    }),
    now: () => new Date("2026-03-23T22:45:00Z"),
    loadJwks: () => Promise.resolve(getTestCanvasJwks()),
  });

  assertEquals(launch.packageVersionId, 1);
  assertEquals(launch.packageVersion, "0.1.0");
  assertEquals(launch.activityId, "resource-link-legacy");
});

Deno.test("createRuntimeSession keeps the pinned approved version instead of resolving latest", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        version: "0.1.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:10:00Z",
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        sessionId: "existing-session",
        sessionToken: "existing-token",
      }),
    ],
  });
  const opaqueTokens = ["runtime-session-123", "runtime-token-123"];
  const session = await createRuntimeSession({
    repository,
    launch: buildValidatedLaunch(),
    now: () => new Date("2026-03-23T22:45:00Z"),
    createOpaqueToken: () => {
      const next = opaqueTokens.shift();

      if (!next) {
        throw new Error("Expected another deterministic runtime token.");
      }

      return next;
    },
  });
  const saved = await repository.getRuntimeSessionById("runtime-session-123");
  const attempt = await repository.getAttemptById("attempt-123");

  assertEquals(session.packageVersionId, 1);
  assertEquals(session.packageVersion, "0.1.0");
  assertEquals(session.attemptId, "attempt-123");
  assertEquals(saved?.packageVersionId, 1);
  assertEquals(saved?.sessionToken, "runtime-token-123");
  assertEquals(saved?.attemptId, "attempt-123");
  assertEquals(attempt?.attemptId, "attempt-123");
  assertEquals(attempt?.status, "in_progress");
});
