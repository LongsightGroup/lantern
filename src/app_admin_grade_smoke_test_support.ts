import { createInMemoryPackageReviewRepository } from "./test_helpers/package_review.ts";
import {
  buildAttemptRecord,
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from "./test_helpers/package_review.ts";
import {
  buildLaunchServiceClaims,
  buildMoodleDeploymentBinding,
  buildRuntimeSessionRecord,
  buildSakaiDeploymentBinding,
} from "./test_helpers/lti.ts";

export interface SmokeFixture {
  binding:
    | ReturnType<typeof buildMoodleDeploymentBinding>
    | ReturnType<typeof buildSakaiDeploymentBinding>;
  session: ReturnType<typeof buildRuntimeSessionRecord>;
  appTitle: string;
  expectedSmokeLineItem: {
    resourceId: string;
    tag: "smoke-verification";
    label: string;
    scoreMaximum: 1;
  };
}

export interface SmokeRouteFixture extends SmokeFixture {
  deploymentId: number;
  deploymentSlug: string;
  attemptId: string;
  userId: string;
  finalGradeLineItemUrl: string;
  smokeLineItemUrl: string;
}

export function buildSmokeFixture(lms: "moodle" | "sakai"): SmokeFixture {
  const binding = lms === "moodle"
    ? buildMoodleDeploymentBinding()
    : buildSakaiDeploymentBinding();
  const appTitle = "Chapter 4 Asteroids";

  return {
    binding,
    session: buildRuntimeSessionRecord({
      deploymentRecordId: lms === "moodle" ? 2 : 3,
      deploymentSlug: `chapter-4-asteroids-${lms}`,
      attemptId: `${lms}-attempt-123`,
      servicesLms: lms,
      services: buildLaunchServiceClaims({
        lms,
        ags: {
          lineitemUrl: null,
        },
      }),
      launch: {
        userRole: "learner",
        courseId: `${lms}-course-42`,
        assignmentId: `${lms}-assignment-9`,
        activityId: "activity-123",
      },
    }),
    appTitle,
    expectedSmokeLineItem: {
      resourceId: `lantern:chapter-4-asteroids:${lms}:smoke`,
      tag: "smoke-verification",
      label: `${appTitle} Smoke Verification`,
      scoreMaximum: 1,
    },
  };
}

export function buildSmokeRouteFixture(
  lms: "moodle" | "sakai",
): SmokeRouteFixture {
  const base = buildSmokeFixture(lms);
  const deploymentId = lms === "moodle" ? 2 : 3;
  const deploymentSlug = `chapter-4-asteroids-${lms}`;
  const attemptId = `${lms}-attempt-123`;
  const finalGradeLineItemUrl = lms === "moodle"
    ? "https://moodle.example/mod/lti/services.php/2/lineitems/final-grade"
    : "https://sakai.example/direct/lti/lineitems/course-42/items/final-grade";
  const smokeLineItemUrl = lms === "moodle"
    ? "https://moodle.example/mod/lti/services.php/2/lineitems/9"
    : "https://sakai.example/direct/lti/lineitems/course-42/items/9";

  return {
    ...base,
    deploymentId,
    deploymentSlug,
    attemptId,
    userId: `${lms}-user-123`,
    finalGradeLineItemUrl,
    smokeLineItemUrl,
    session: buildRuntimeSessionRecord({
      deploymentRecordId: deploymentId,
      deploymentSlug,
      attemptId,
      servicesLms: lms,
      services: buildLaunchServiceClaims({
        lms,
        ags: {
          lineitemUrl: finalGradeLineItemUrl,
        },
      }),
      launch: {
        userRole: "learner",
        courseId: `${lms}-course-42`,
        assignmentId: `${lms}-assignment-9`,
        activityId: "activity-123",
      },
    }),
  };
}

export function createSmokeRouteRepository(
  fixture: SmokeRouteFixture,
  input: {
    includeControlPlaneDetail?: boolean;
  } = {},
) {
  return createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: fixture.deploymentId,
        slug: fixture.deploymentSlug,
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        lmsType: fixture.binding.lms,
        binding: fixture.binding,
      }),
    ],
    attempts: [
      buildAttemptRecord({
        attemptId: fixture.attemptId,
        deploymentRecordId: fixture.deploymentId,
        deploymentSlug: fixture.deploymentSlug,
        userId: fixture.userId,
        contextId: fixture.session.launch.courseId,
        activityId: fixture.session.launch.activityId,
      }),
    ],
    runtimeSessions: [fixture.session],
    controlPlaneDeploymentDetails: input.includeControlPlaneDetail
      ? [
        buildControlPlaneDeploymentDetailSnapshot({
          inventory: buildControlPlaneDeploymentInventoryRow({
            deploymentId: fixture.deploymentId,
            deploymentSlug: fixture.deploymentSlug,
            binding: fixture.binding,
            enabledPackageVersionId: 1,
            enabledPackageVersion: "0.1.0",
          }),
          latestAgsSmoke: null,
        }),
      ]
      : [],
  });
}

export function buildSmokeVerificationFormData(
  fixture: SmokeRouteFixture,
): FormData {
  const formData = new FormData();
  formData.set("lms", fixture.binding.lms);
  formData.set("deploymentRecordId", String(fixture.deploymentId));
  return formData;
}

export function createSuccessfulSmokeFetchHandler(
  fixture: SmokeRouteFixture,
  requestedUrls: string[] = [],
) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requestedUrls.push(`${init?.method ?? "GET"} ${url}`);

    if (url === fixture.binding.accessTokenUrl) {
      return new Response(
        JSON.stringify({
          access_token: `${fixture.binding.lms}-access-token`,
          token_type: "bearer",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (
      url === fixture.session.services.ags?.lineitemsUrl &&
      (init?.method ?? "GET") === "GET"
    ) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    if (
      url === fixture.session.services.ags?.lineitemsUrl &&
      init?.method === "POST"
    ) {
      return new Response(
        JSON.stringify({
          id: fixture.smokeLineItemUrl,
          label: fixture.expectedSmokeLineItem.label,
          scoreMaximum: fixture.expectedSmokeLineItem.scoreMaximum,
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (
      url === `${fixture.smokeLineItemUrl}/scores` && init?.method === "POST"
    ) {
      return new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    throw new Error(`Unexpected smoke request ${init?.method ?? "GET"} ${url}`);
  };
}
