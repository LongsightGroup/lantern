import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../app.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "../test_helpers/lti.ts";
import { restoreEnv, withFetchStub } from "./deployment_detail_test_helpers.ts";

Deno.test("POST /admin/packages/:appId/deployment/verify-roster stores a deployment-level NRPS verification summary", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
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
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "certification",
      updatedAt: "2026-03-24T12:25:00Z",
    },
    runtimeSessions: [
      buildRuntimeSessionRecord({
        expiresAt: "2026-03-25T02:45:00Z",
      }),
    ],
  });

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withFetchStub(
      (input, init) => {
        const url = String(input);
        const headers = new Headers(init?.headers);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          const body = typeof init?.body === "string"
            ? init.body
            : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : "";

          assertStringIncludes(body, "deployment_id=deployment-123");

          return new Response(
            JSON.stringify({
              access_token: "canvas-access-token",
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

        assertEquals(
          headers.get("user-agent"),
          "Lantern-LTI-Service/1.0",
        );

        return new Response(
          JSON.stringify({
            members: [
              {
                user_id: "canvas-user-123",
                roles: ["Learner"],
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      async () => {
        const response = await createApp({
          getRepository: () => repository,
        }).request(
          "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster",
          {
            method: "POST",
            headers: {
              Origin: "http://localhost",
            },
          },
        );

        assertEquals(response.status, 303);
        assertEquals(
          response.headers.get("location"),
          "/admin/packages/chapter-4-asteroids/deployment",
        );

        const auditEvents = await repository.listAuditEventsByEventType(
          "deployment.nrps_verified",
        );

        assertEquals(auditEvents.length, 1);
        assertEquals(auditEvents[0]?.status, "succeeded");
        assertEquals(auditEvents[0]?.detail.memberCount, 1);
        assertEquals(auditEvents[0]?.detail.ltiProfileId, "certification");
        assertEquals(
          auditEvents[0]?.detail.ltiProfileSource,
          "lanternDefault",
        );
      },
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("deployment roster verification fails clearly when no launch service context exists yet", async () => {
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
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/verify-roster",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
    },
  );
  const body = await response.text();

  assertEquals(response.status, 409);
  assertStringIncludes(
    body,
    "Launch the deployment from Canvas once before verifying roster access.",
  );
});
