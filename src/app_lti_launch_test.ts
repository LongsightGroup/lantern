import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { CANVAS_LTI_SCOPES } from "./lti/types.ts";
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildLoginStateRecord,
  getTestCanvasJwks,
  signCanvasIdToken,
} from "./test_helpers/lti.ts";
import { withFetchStub } from "./app_test_support.ts";

Deno.test("POST /lti/launch validates the signed launch and redirects to a runtime-session handoff", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
        ltiProfileOverride: "certification",
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        state: "state-launch-123",
        nonce: "nonce-launch-123",
        expiresAt: "2030-03-26T02:45:00Z",
      }),
    ],
  });
  const idToken = await signCanvasIdToken({
    nonce: "nonce-launch-123",
    audience: "10000000000001",
    issuedAt: "2026-03-24T00:45:00Z",
    expirationTime: "2h",
    name: "Ada Lovelace",
    email: "ada@example.com",
    preferredUsername: "adal",
  });
  const formData = new FormData();

  formData.set("state", "state-launch-123");
  formData.set("id_token", idToken);

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify(getTestCanvasJwks()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request("http://localhost/lti/launch", {
        method: "POST",
        body: formData,
      });

      assertEquals(response.status, 303);
      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Expected runtime-session handoff redirect.");
      }

      assertStringIncludes(location, "/runtime/sessions/");
      assertStringIncludes(location, "token=");

      const sessionId = location.match(/\/runtime\/sessions\/([^?]+)/)?.[1];

      if (!sessionId) {
        throw new Error("Expected runtime session id in redirect.");
      }

      const saved = await repository.getRuntimeSessionById(sessionId);

      if (!saved) {
        throw new Error("Expected saved runtime session.");
      }

      const attempt = await repository.getAttemptById(saved.attemptId);
      const auditEvents = await repository.listAuditEventsByEventType(
        "launch.accepted",
      );

      assertEquals(saved.packageVersionId, 5);
      assertEquals(typeof saved.attemptId, "string");
      assertEquals(saved.launch.userRole, "learner");
      assertEquals(
        saved.services.ags?.scope,
        [...CANVAS_LTI_SCOPES].slice(0, 2),
      );
      assertEquals(
        saved.services.nrps?.contextMembershipsUrl?.includes("names_and_roles"),
        true,
      );
      assertEquals(attempt?.attemptId, saved.attemptId);
      assertEquals(attempt?.userDisplayName, "Ada Lovelace");
      assertEquals(attempt?.userEmail, "ada@example.com");
      assertEquals(attempt?.userLogin, "adal");
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.attemptId, saved.attemptId);
      assertEquals(auditEvents[0]?.detail.userDisplayName, "Ada Lovelace");
      assertEquals(auditEvents[0]?.detail.userEmail, "ada@example.com");
      assertEquals(auditEvents[0]?.detail.userLogin, "adal");
      assertEquals(auditEvents[0]?.detail.ltiProfileId, "certification");
      assertEquals(
        auditEvents[0]?.detail.ltiProfileSource,
        "deploymentOverride",
      );
    },
  );
});
