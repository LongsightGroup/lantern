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
  buildMoodleDeploymentBinding,
  buildSakaiDeploymentBinding,
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
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.attemptId, saved.attemptId);
    },
  );
});

Deno.test("POST /lti/launch accepts a signed Moodle resource-link launch and records shared audit evidence", async () => {
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
        id: 13,
        slug: "chapter-4-asteroids-moodle",
        label: "Chapter 4 Asteroids Moodle Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildMoodleDeploymentBinding({
          issuer: "https://moodle.example",
          clientId: "moodle-client-123",
          deploymentId: "moodle-deployment-123",
        }),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        lms: "moodle",
        issuer: "https://moodle.example",
        clientId: "moodle-client-123",
        deploymentId: "moodle-deployment-123",
        state: "state-moodle-launch",
        nonce: "nonce-moodle-launch",
        expiresAt: "2030-03-26T02:45:00Z",
      }),
    ],
  });
  const formData = new FormData();

  formData.set("state", "state-moodle-launch");
  formData.set(
    "id_token",
    await signCanvasIdToken({
      deploymentBinding: {
        issuer: "https://moodle.example",
        clientId: "moodle-client-123",
        deploymentId: "moodle-deployment-123",
      },
      nonce: "nonce-moodle-launch",
      audience: "moodle-client-123",
      issuedAt: "2026-03-24T00:45:00Z",
      expirationTime: "2h",
      resourceLinkId: "moodle-resource-link",
      contextId: "moodle-course-42",
      contextTitle: "Moodle Physics 101",
      returnUrl: "https://moodle.example/mod/lti/return.php",
    }),
  );

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

      const sessionId = location.match(/\/runtime\/sessions\/([^?]+)/)?.[1];

      if (!sessionId) {
        throw new Error("Expected runtime session id in redirect.");
      }

      const saved = await repository.getRuntimeSessionById(sessionId);
      const auditEvents = await repository.listAuditEventsByEventType(
        "launch.accepted",
      );

      assertEquals(saved?.deploymentRecordId, 13);
      assertEquals(saved?.launch.courseId, "moodle-course-42");
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.detail.lms, "moodle");
      assertEquals(auditEvents[0]?.detail.issuer, "https://moodle.example");
      assertEquals(auditEvents[0]?.detail.clientId, "moodle-client-123");
      assertEquals(
        auditEvents[0]?.detail.deploymentId,
        "moodle-deployment-123",
      );
      assertEquals(
        auditEvents[0]?.detail.resourceLinkId,
        "moodle-resource-link",
      );
      assertEquals(auditEvents[0]?.detail.contextId, "moodle-course-42");
    },
  );
});

Deno.test("POST /lti/launch accepts a signed Sakai resource-link launch and records shared audit evidence", async () => {
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
        id: 17,
        slug: "chapter-4-asteroids-sakai",
        label: "Chapter 4 Asteroids Sakai Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildSakaiDeploymentBinding({
          issuer: "https://sakai.example",
          clientId: "sakai-client-123",
          deploymentId: "sakai-deployment-123",
        }),
      }),
    ],
    loginStates: [
      buildLoginStateRecord({
        lms: "sakai",
        issuer: "https://sakai.example",
        clientId: "sakai-client-123",
        deploymentId: "sakai-deployment-123",
        state: "state-sakai-launch",
        nonce: "nonce-sakai-launch",
        expiresAt: "2030-03-26T02:45:00Z",
      }),
    ],
  });
  const formData = new FormData();

  formData.set("state", "state-sakai-launch");
  formData.set(
    "id_token",
    await signCanvasIdToken({
      deploymentBinding: {
        issuer: "https://sakai.example",
        clientId: "sakai-client-123",
        deploymentId: "sakai-deployment-123",
      },
      nonce: "nonce-sakai-launch",
      audience: "sakai-client-123",
      issuedAt: "2026-03-24T00:45:00Z",
      expirationTime: "2h",
      resourceLinkId: "sakai-resource-link",
      contextId: "sakai-course-42",
      contextTitle: "Sakai Physics 101",
      returnUrl: "https://sakai.example/portal/site/course",
    }),
  );

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

      const sessionId = location.match(/\/runtime\/sessions\/([^?]+)/)?.[1];

      if (!sessionId) {
        throw new Error("Expected runtime session id in redirect.");
      }

      const saved = await repository.getRuntimeSessionById(sessionId);
      const auditEvents = await repository.listAuditEventsByEventType(
        "launch.accepted",
      );

      assertEquals(saved?.deploymentRecordId, 17);
      assertEquals(saved?.launch.courseId, "sakai-course-42");
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.detail.lms, "sakai");
      assertEquals(auditEvents[0]?.detail.issuer, "https://sakai.example");
      assertEquals(auditEvents[0]?.detail.clientId, "sakai-client-123");
      assertEquals(
        auditEvents[0]?.detail.deploymentId,
        "sakai-deployment-123",
      );
      assertEquals(
        auditEvents[0]?.detail.resourceLinkId,
        "sakai-resource-link",
      );
      assertEquals(auditEvents[0]?.detail.contextId, "sakai-course-42");
    },
  );
});
