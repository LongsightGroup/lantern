import { assertEquals, assertRejects } from "@std/assert";
import { validateLaunchRequest } from "./launch.ts";
import { expectLaunchRejection } from "./launch_test_support.ts";
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  signCanvasIdToken,
} from "../test_helpers/lti.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  buildReviewedPlacementRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";

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

Deno.test("validateLaunchRequest rejects reviewed placement launches with a stable code when the saved placement belongs to another deployment", async () => {
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
        slug: "chapter-4-asteroids-pilot",
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: "placement-123",
        deploymentRecordId: 8,
        deploymentSlug: "chapter-4-asteroids-other",
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
  const error = await assertRejects(() =>
    validateLaunchRequest({
      repository,
      state: "state-123",
      idToken,
      now: () => new Date("2026-03-23T22:45:00Z"),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    })
  );
  const rejection = expectLaunchRejection(error);

  assertEquals(rejection.code, "reviewed_placement_deployment_mismatch");
  assertEquals(rejection.detail.placementId, "placement-123");
  assertEquals(rejection.detail.deploymentSlug, "chapter-4-asteroids-pilot");
});

Deno.test("validateLaunchRequest rejects reviewed placement launches with a stable code when the saved placement context does not match", async () => {
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
        contextId: "course-99",
      }),
    ],
    loginStates: [buildLoginStateRecord()],
  });
  const idToken = await signCanvasIdToken({
    nonce: "nonce-123",
    audience: "10000000000001",
    custom: {
      lantern_placement_id: "placement-123",
    },
  });
  const error = await assertRejects(() =>
    validateLaunchRequest({
      repository,
      state: "state-123",
      idToken,
      now: () => new Date("2026-03-23T22:45:00Z"),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    })
  );
  const rejection = expectLaunchRejection(error);

  assertEquals(rejection.code, "reviewed_placement_context_mismatch");
  assertEquals(rejection.detail.placementId, "placement-123");
  assertEquals(rejection.detail.contextId, "course-42");
});

Deno.test("validateLaunchRequest rejects reviewed placement launches with a stable code when the resource link conflicts with the saved placement binding", async () => {
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

  const error = await assertRejects(() =>
    validateLaunchRequest({
      repository,
      state: "state-123",
      idToken,
      now: () => new Date("2026-03-23T22:45:00Z"),
      loadJwks: () => Promise.resolve(getTestCanvasJwks()),
    })
  );
  const rejection = expectLaunchRejection(error);

  assertEquals(rejection.code, "reviewed_placement_resource_link_conflict");
  assertEquals(rejection.detail.placementId, "placement-123");
  assertEquals(rejection.detail.resourceLinkId, "resource-link-other");

  const loginState = await repository.getLoginStateByState("state-123");

  assertEquals(loginState?.usedAt, null);
});
