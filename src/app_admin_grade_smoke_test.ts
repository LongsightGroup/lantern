import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import type { EnsureLineItemInput } from "./lti/services.ts";
import type { DeploymentBinding, RuntimeSessionRecord } from "./lti/types.ts";
import {
  buildFinalGradeLineItemSpec,
  buildSmokeVerificationLineItemSpec,
  ensureManagedLineItem,
  requestAccessToken,
} from "./runtime/gateway_publication_support.ts";
import {
  buildLaunchServiceClaims,
  buildMoodleDeploymentBinding,
  buildRuntimeSessionRecord,
  buildSakaiDeploymentBinding,
  getTestToolPrivateJwkEnvValue,
} from "./test_helpers/lti.ts";
import {
  buildAttemptRecord,
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  restoreEnv,
  withFetchStub,
} from "./admin/deployment_detail_test_helpers.ts";

interface SmokeFixture {
  binding: Extract<DeploymentBinding, { lms: "moodle" | "sakai" }>;
  session: RuntimeSessionRecord;
  appTitle: string;
  expectedSmokeLineItem: {
    resourceId: string;
    tag: "smoke-verification";
    label: string;
    scoreMaximum: 1;
  };
}

function buildSmokeFixture(lms: "moodle" | "sakai"): SmokeFixture {
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

interface SmokeRouteFixture extends SmokeFixture {
  deploymentId: number;
  deploymentSlug: string;
  attemptId: string;
  userId: string;
  finalGradeLineItemUrl: string;
  smokeLineItemUrl: string;
}

function buildSmokeRouteFixture(
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

Deno.test(
  "grade smoke scaffolding seeds one blessed Moodle smoke path with a dedicated smoke line item identity",
  () => {
    const fixture = buildSmokeFixture("moodle");

    assertEquals(fixture.binding.lms, "moodle");
    assertEquals(
      fixture.session.services.ags?.lineitemsUrl,
      "https://moodle.example/mod/lti/services.php/2/lineitems",
    );
    assertEquals(
      fixture.expectedSmokeLineItem.resourceId,
      "lantern:chapter-4-asteroids:moodle:smoke",
    );
    assertEquals(fixture.expectedSmokeLineItem.tag, "smoke-verification");
    assertEquals(fixture.expectedSmokeLineItem.scoreMaximum, 1);
  },
);

Deno.test(
  "grade smoke scaffolding seeds one blessed Sakai smoke path with a dedicated smoke line item identity",
  () => {
    const fixture = buildSmokeFixture("sakai");

    assertEquals(fixture.binding.lms, "sakai");
    assertEquals(
      fixture.session.services.ags?.lineitemsUrl,
      "https://sakai.example/direct/lti/lineitems/course-42/items",
    );
    assertEquals(
      fixture.expectedSmokeLineItem.resourceId,
      "lantern:chapter-4-asteroids:sakai:smoke",
    );
    assertEquals(fixture.expectedSmokeLineItem.tag, "smoke-verification");
    assertEquals(fixture.expectedSmokeLineItem.scoreMaximum, 1);
  },
);

Deno.test(
  "grade smoke verification uses the shared AGS helper to create or reuse a dedicated smoke line item",
  async () => {
    const moodleFixture = buildSmokeFixture("moodle");
    const sakaiFixture = buildSmokeFixture("sakai");
    const requests: Array<{
      resourceId: string;
      tag: string;
      label: string;
      scoreMaximum: number;
      lineitemsUrl: string | null;
    }> = [];

    const moodleResult = await ensureManagedLineItem({
      accessToken: "moodle-access-token",
      ags: moodleFixture.session.services.ags!,
      resourceLinkId: "resource-link-123",
      spec: buildSmokeVerificationLineItemSpec({
        appId: "chapter-4-asteroids",
        appTitle: moodleFixture.appTitle,
        lms: moodleFixture.binding.lms,
      }),
      ensureLineItemFn: (input: EnsureLineItemInput) => {
        requests.push({
          resourceId: input.resourceId,
          tag: input.tag,
          label: input.label,
          scoreMaximum: input.scoreMaximum,
          lineitemsUrl: input.lineitemsUrl,
        });

        return Promise.resolve({
          lineItemsUrl: input.lineitemsUrl!,
          lineItemUrl:
            "https://moodle.example/mod/lti/services.php/2/lineitems/9",
          resourceId: input.resourceId,
          tag: input.tag,
          label: input.label,
          scoreMaximum: input.scoreMaximum,
          created: true,
        });
      },
    });

    const sakaiResult = await ensureManagedLineItem({
      accessToken: "sakai-access-token",
      ags: sakaiFixture.session.services.ags!,
      resourceLinkId: "resource-link-123",
      spec: buildSmokeVerificationLineItemSpec({
        appId: "chapter-4-asteroids",
        appTitle: sakaiFixture.appTitle,
        lms: sakaiFixture.binding.lms,
      }),
      ensureLineItemFn: (input: EnsureLineItemInput) => {
        requests.push({
          resourceId: input.resourceId,
          tag: input.tag,
          label: input.label,
          scoreMaximum: input.scoreMaximum,
          lineitemsUrl: input.lineitemsUrl,
        });

        return Promise.resolve({
          lineItemsUrl: input.lineitemsUrl!,
          lineItemUrl:
            "https://sakai.example/direct/lti/lineitems/course-42/items/9",
          resourceId: input.resourceId,
          tag: input.tag,
          label: input.label,
          scoreMaximum: input.scoreMaximum,
          created: false,
        });
      },
    });

    assertEquals(moodleResult.created, true);
    assertEquals(sakaiResult.created, false);
    assertEquals(requests[0], {
      resourceId: moodleFixture.expectedSmokeLineItem.resourceId,
      tag: "smoke-verification",
      label: "Chapter 4 Asteroids Smoke Verification",
      scoreMaximum: 1,
      lineitemsUrl: "https://moodle.example/mod/lti/services.php/2/lineitems",
    });
    assertEquals(requests[1], {
      resourceId: sakaiFixture.expectedSmokeLineItem.resourceId,
      tag: "smoke-verification",
      label: "Chapter 4 Asteroids Smoke Verification",
      scoreMaximum: 1,
      lineitemsUrl:
        "https://sakai.example/direct/lti/lineitems/course-42/items",
    });
  },
);

Deno.test(
  "grade smoke verification records a bounded token failure without reusing the learner final-grade line item",
  async () => {
    const fixture = buildSmokeFixture("moodle");
    const result = await requestAccessToken({
      scope: fixture.session.services.ags!.scope,
      binding: fixture.binding,
      lineItemBinding: null,
      requestToken: () => Promise.reject(new Error("simulated token failure")),
    });

    if (typeof result === "string") {
      throw new Error("Expected smoke token failure details.");
    }

    assertEquals(result.publishError?.code, "token_request_failed");
    assertEquals(result.publishError?.detail.issuer, fixture.binding.issuer);
    assertEquals(
      result.publishError?.detail.deploymentId,
      fixture.binding.deploymentId,
    );
    assertEquals(
      JSON.stringify(result.publishError?.detail ?? {}).includes("final-grade"),
      false,
    );
  },
);

Deno.test(
  "POST /admin/packages/:appId/deployment/verify-grade-smoke runs the blessed Moodle smoke path and records deployment-scoped evidence",
  async () => {
    const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
    const fixture = buildSmokeRouteFixture("moodle");
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
    });
    const requestedUrls: string[] = [];
    const formData = new FormData();

    formData.set("lms", "moodle");
    formData.set("deploymentRecordId", String(fixture.deploymentId));
    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub(
        (input, init) => {
          const url = String(input);
          requestedUrls.push(`${init?.method ?? "GET"} ${url}`);

          if (url === fixture.binding.accessTokenUrl) {
            return new Response(
              JSON.stringify({
                access_token: "moodle-access-token",
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
            url === `${fixture.smokeLineItemUrl}/scores` &&
            init?.method === "POST"
          ) {
            return new Response("{}", {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            });
          }

          throw new Error(
            `Unexpected smoke request ${init?.method ?? "GET"} ${url}`,
          );
        },
        async () => {
          const response = await createApp({
            getRepository: () => repository,
          }).request(
            "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke",
            {
              method: "POST",
              headers: {
                Origin: "http://localhost",
              },
              body: formData,
            },
          );

          assertEquals(response.status, 303);
          assertEquals(
            response.headers.get("location"),
            "/admin/packages/chapter-4-asteroids/deployment?lms=moodle#slot-panel",
          );

          const auditEvents = await repository.listAuditEventsByEventType(
            "deployment.ags_smoke_verified",
          );

          assertEquals(auditEvents.length, 1);
          assertEquals(auditEvents[0]?.status, "succeeded");
          assertEquals(
            auditEvents[0]?.deploymentRecordId,
            fixture.deploymentId,
          );
          assertEquals(auditEvents[0]?.detail.lms, "moodle");
          assertEquals(auditEvents[0]?.detail.agsCapable, true);
          assertEquals(auditEvents[0]?.detail.publicationStatus, "succeeded");
          assertEquals(
            auditEvents[0]?.detail.lineItemUrl,
            fixture.smokeLineItemUrl,
          );
          assertEquals(
            requestedUrls.includes(
              `POST ${fixture.finalGradeLineItemUrl}/scores`,
            ),
            false,
          );
        },
      );
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "POST /admin/packages/:appId/deployment/verify-grade-smoke runs the blessed Sakai smoke path and records deployment-scoped evidence",
  async () => {
    const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
    const fixture = buildSmokeRouteFixture("sakai");
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
    });
    const requestedUrls: string[] = [];
    const formData = new FormData();

    formData.set("lms", "sakai");
    formData.set("deploymentRecordId", String(fixture.deploymentId));
    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub(
        (input, init) => {
          const url = String(input);
          requestedUrls.push(`${init?.method ?? "GET"} ${url}`);

          if (url === fixture.binding.accessTokenUrl) {
            return new Response(
              JSON.stringify({
                access_token: "sakai-access-token",
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
            url === `${fixture.smokeLineItemUrl}/scores` &&
            init?.method === "POST"
          ) {
            return new Response("{}", {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            });
          }

          throw new Error(
            `Unexpected smoke request ${init?.method ?? "GET"} ${url}`,
          );
        },
        async () => {
          const response = await createApp({
            getRepository: () => repository,
          }).request(
            "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke",
            {
              method: "POST",
              headers: {
                Origin: "http://localhost",
              },
              body: formData,
            },
          );

          assertEquals(response.status, 303);
          assertEquals(
            response.headers.get("location"),
            "/admin/packages/chapter-4-asteroids/deployment?lms=sakai#slot-panel",
          );

          const auditEvents = await repository.listAuditEventsByEventType(
            "deployment.ags_smoke_verified",
          );

          assertEquals(auditEvents.length, 1);
          assertEquals(auditEvents[0]?.status, "succeeded");
          assertEquals(
            auditEvents[0]?.deploymentRecordId,
            fixture.deploymentId,
          );
          assertEquals(auditEvents[0]?.detail.lms, "sakai");
          assertEquals(auditEvents[0]?.detail.agsCapable, true);
          assertEquals(auditEvents[0]?.detail.publicationStatus, "succeeded");
          assertEquals(
            auditEvents[0]?.detail.lineItemUrl,
            fixture.smokeLineItemUrl,
          );
          assertEquals(
            requestedUrls.includes(
              `POST ${fixture.finalGradeLineItemUrl}/scores`,
            ),
            false,
          );
        },
      );
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "POST /admin/packages/:appId/deployment/verify-grade-smoke records bounded deployment-scoped failure evidence when the service token request fails",
  async () => {
    const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
    const fixture = buildSmokeRouteFixture("moodle");
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
    });
    const formData = new FormData();

    formData.set("lms", "moodle");
    formData.set("deploymentRecordId", String(fixture.deploymentId));
    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub(
        (input) => {
          const url = String(input);

          if (url === fixture.binding.accessTokenUrl) {
            throw new Error("simulated token failure");
          }

          throw new Error(`Unexpected smoke request GET ${url}`);
        },
        async () => {
          const response = await createApp({
            getRepository: () => repository,
          }).request(
            "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke",
            {
              method: "POST",
              headers: {
                Origin: "http://localhost",
              },
              body: formData,
            },
          );
          const body = await response.text();

          assertEquals(response.status, 500);
          assertStringIncludes(body, "Grade smoke verification failed");

          const auditEvents = await repository.listAuditEventsByEventType(
            "deployment.ags_smoke_verified",
          );
          const errorDetail = (auditEvents[0]?.detail.error ?? null) as
            | { code?: string; message?: string }
            | null;

          assertEquals(auditEvents.length, 1);
          assertEquals(auditEvents[0]?.status, "failed");
          assertEquals(auditEvents[0]?.detail.lms, "moodle");
          assertEquals(auditEvents[0]?.detail.agsCapable, true);
          assertEquals(
            auditEvents[0]?.detail.publicationStatus,
            "not_attempted",
          );
          assertEquals(auditEvents[0]?.detail.lineItemUrl, null);
          assertEquals(errorDetail?.code, "token_request_failed");
          assertEquals(errorDetail?.message, "simulated token failure");
          assertEquals(
            JSON.stringify(auditEvents[0]?.detail ?? {}).includes(
              "final-grade",
            ),
            false,
          );
        },
      );
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "deployment smoke verification renders the latest Moodle result back on the existing deployment detail page",
  async () => {
    const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
    const fixture = buildSmokeRouteFixture("moodle");
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
      controlPlaneDeploymentDetails: [
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
      ],
    });
    const formData = new FormData();

    formData.set("lms", "moodle");
    formData.set("deploymentRecordId", String(fixture.deploymentId));
    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub(
        (input, init) => {
          const url = String(input);

          if (url === fixture.binding.accessTokenUrl) {
            return new Response(
              JSON.stringify({
                access_token: "moodle-access-token",
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
            url === `${fixture.smokeLineItemUrl}/scores` &&
            init?.method === "POST"
          ) {
            return new Response("{}", {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            });
          }

          throw new Error(
            `Unexpected smoke request ${init?.method ?? "GET"} ${url}`,
          );
        },
        async () => {
          const postResponse = await createApp({
            getRepository: () => repository,
          }).request(
            "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-grade-smoke",
            {
              method: "POST",
              headers: {
                Origin: "http://localhost",
              },
              body: formData,
            },
          );

          assertEquals(postResponse.status, 303);

          const getResponse = await createApp({
            getRepository: () => repository,
          }).request(
            "http://localhost/admin/packages/chapter-4-asteroids/deployment?lms=moodle",
          );
          const body = await getResponse.text();

          assertEquals(getResponse.status, 200);
          assertStringIncludes(body, "Latest grade smoke verification");
          assertStringIncludes(body, "AGS capability");
          assertStringIncludes(body, fixture.smokeLineItemUrl);
          assertStringIncludes(body, "Run grade smoke check");
        },
      );
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "runtime final-grade publication stays on the same shared managed line-item helper path",
  async () => {
    const session = buildRuntimeSessionRecord();
    const packageVersion = buildPackageVersionRecord();
    const requests: Array<{
      resourceId: string;
      tag: string;
      label: string;
      scoreMaximum: number;
    }> = [];

    const result = await ensureManagedLineItem({
      accessToken: "canvas-access-token",
      ags: session.services.ags!,
      resourceLinkId: "resource-link-123",
      spec: buildFinalGradeLineItemSpec({
        session,
        packageVersion,
        scoreMaximum: 100,
      }),
      ensureLineItemFn: (input: EnsureLineItemInput) => {
        requests.push({
          resourceId: input.resourceId,
          tag: input.tag,
          label: input.label,
          scoreMaximum: input.scoreMaximum,
        });

        return Promise.resolve({
          lineItemsUrl: input.lineitemsUrl!,
          lineItemUrl: input.lineitemUrl ??
            "https://canvas.example/api/lti/courses/42/line_items/9",
          resourceId: input.resourceId,
          tag: input.tag,
          label: input.label,
          scoreMaximum: input.scoreMaximum,
          created: false,
        });
      },
    });

    assertEquals(result.created, false);
    assertEquals(requests, [{
      resourceId: "lantern:chapter-4-asteroids:0.1.0:activity-123",
      tag: "final-grade",
      label: "Chapter 4 Asteroids Final Grade",
      scoreMaximum: 100,
    }]);
  },
);
