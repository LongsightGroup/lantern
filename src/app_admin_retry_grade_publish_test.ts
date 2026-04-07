import {
  assertEquals,
  assertObjectMatch,
  assertStringIncludes,
} from "@std/assert";
import { createApp } from "./app.ts";
import { restoreEnv, withFetchStub } from "./app_test_support.ts";
import {
  buildAttemptRecord,
  buildControlPlaneDeploymentDetailSnapshot,
  buildControlPlaneDeploymentInventoryRow,
  buildControlPlaneDiagnosticItem,
  buildDeploymentRecord,
  buildGradePublicationRecord,
  buildPackageVersionRecord,
  buildRetryableGradePublicationLookup,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "./test_helpers/lti.ts";

Deno.test("POST /admin/packages/:appId/deployment/retry-grade-publish retries the failed grade publish through the SSR control plane", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 1,
        attemptId: "attempt-123",
        deploymentRecordId: 3,
        packageVersionId: 5,
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        id: 1,
        attemptId: "attempt-123",
        status: "failed",
        publishedAt: null,
        updatedAt: "2026-03-24T12:35:00Z",
        errorCode: "token_request_failed",
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        attemptId: "attempt-123",
        deploymentRecordId: 3,
        packageVersionId: 5,
        packageVersion: "0.1.0",
        expiresAt: "2026-03-26T12:30:00Z",
      }),
    ],
    controlPlaneDeploymentDetails: [
      buildControlPlaneDeploymentDetailSnapshot({
        inventory: buildControlPlaneDeploymentInventoryRow({
          deploymentId: 3,
          enabledPackageVersionId: 5,
          enabledPackageVersion: "0.1.0",
          binding: buildDeploymentBinding(),
        }),
        diagnostics: [
          buildControlPlaneDiagnosticItem({
            id: 3,
            kind: "gradePublication",
            eventType: "grade_publish.failed",
            status: "failed",
            attemptId: "attempt-123",
            code: "token_request_failed",
            retryable: true,
          }),
        ],
        retryableGradePublication: buildRetryableGradePublicationLookup({
          attemptId: "attempt-123",
          deploymentRecordId: 3,
        }),
      }),
    ],
  });
  const formData = new FormData();

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());
  formData.set("attemptId", "attempt-123");

  try {
    await withFetchStub(
      (input) => {
        const url = String(input);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          return new Response(
            JSON.stringify({
              access_token: "canvas-access-token",
              token_type: "bearer",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(null, { status: 200 });
      },
      async () => {
        const response = await createApp({
          getRepository: () => repository,
        }).request(
          "http://localhost/admin/packages/chapter-4-asteroids/deployment/retry-grade-publish",
          {
            method: "POST",
            headers: { Origin: "http://localhost" },
            body: formData,
          },
        );

        assertEquals(response.status, 303);
        assertEquals(
          response.headers.get("location"),
          "/admin/packages/chapter-4-asteroids/deployment",
        );
      },
    );

    const publication = await repository.getGradePublicationByAttemptId(
      "attempt-123",
    );
    const auditEvents = await repository.listAuditEventsByEventType(
      "grade_publish.retry_succeeded",
    );

    assertEquals(publication?.status, "published");
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.attemptId, "attempt-123");
    assertEquals(
      JSON.stringify(auditEvents[0]?.detail ?? {}).includes(
        "canvas-access-token",
      ),
      false,
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("POST /admin/packages/:appId/deployment/retry-grade-publish records bounded request context when the retry fails", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 1,
        attemptId: "attempt-123",
        deploymentRecordId: 3,
        packageVersionId: 5,
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        id: 1,
        attemptId: "attempt-123",
        status: "failed",
        publishedAt: null,
        updatedAt: "2026-03-24T12:35:00Z",
        errorCode: "token_request_failed",
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        attemptId: "attempt-123",
        deploymentRecordId: 3,
        packageVersionId: 5,
        packageVersion: "0.1.0",
        expiresAt: "2026-03-26T12:30:00Z",
      }),
    ],
    controlPlaneDeploymentDetails: [
      buildControlPlaneDeploymentDetailSnapshot({
        inventory: buildControlPlaneDeploymentInventoryRow({
          deploymentId: 3,
          enabledPackageVersionId: 5,
          enabledPackageVersion: "0.1.0",
          binding: buildDeploymentBinding(),
        }),
        diagnostics: [
          buildControlPlaneDiagnosticItem({
            id: 3,
            kind: "gradePublication",
            eventType: "grade_publish.failed",
            status: "failed",
            attemptId: "attempt-123",
            code: "token_request_failed",
            retryable: true,
          }),
        ],
        retryableGradePublication: buildRetryableGradePublicationLookup({
          attemptId: "attempt-123",
          deploymentRecordId: 3,
        }),
      }),
    ],
  });
  const formData = new FormData();

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());
  formData.set("attemptId", "attempt-123");

  try {
    await withFetchStub(
      () =>
        new Response(JSON.stringify({ error: "invalid_client" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      async () => {
        const response = await createApp({
          getRepository: () => repository,
        }).request(
          "http://localhost/admin/packages/chapter-4-asteroids/deployment/retry-grade-publish",
          {
            method: "POST",
            headers: {
              Origin: "http://localhost",
              "x-real-ip": "203.0.113.91",
            },
            body: formData,
          },
        );
        const body = await response.text();

        assertEquals(response.status, 500);
        assertStringIncludes(body, "Grade publish retry failed");
      },
    );

    const auditEvents = await repository.listAuditEventsByEventType(
      "grade_publish.retry_failed",
    );

    assertEquals(auditEvents.length, 1);
    assertObjectMatch(auditEvents[0]?.detail.request ?? {}, {
      method: "POST",
      path:
        "/admin/packages/chapter-4-asteroids/deployment/retry-grade-publish",
      formKeys: ["attemptId"],
      clientIpMasked: "203.0.113.x",
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});
