import { assertEquals } from "@std/assert";
import { createApp } from "./app.ts";
import {
  EXAMPLE_SNAPSHOT_ROOT,
  restoreEnv,
  withFetchStub,
  withRuntimeOriginEnv,
} from "./app_test_support.ts";
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildDeploymentRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "./test_helpers/lti.ts";

Deno.test("POST /runtime/sessions/:id/finalize finalizes the durable attempt and keeps grade publication inside the gateway boundary", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withRuntimeOriginEnv(async () => {
      const repository = createInMemoryPackageReviewRepository({
        packageVersions: [
          buildPackageVersionRecord({
            artifact: {
              snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
              manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
              entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
              digest: "sha256:example-snapshot",
            },
          }),
        ],
        deployments: [
          buildDeploymentRecord({ binding: buildDeploymentBinding() }),
        ],
        attempts: [buildAttemptRecord()],
        attemptEvents: [
          buildAttemptEventRecord({
            id: 1,
            sequence: 1,
            event: {
              type: "answer",
              questionId: "q1",
              answer: "resistance to a change in motion",
              timestamp: "2026-03-24T02:30:00Z",
            },
          }),
          buildAttemptEventRecord({
            id: 2,
            sequence: 2,
            event: {
              type: "answer",
              questionId: "q2",
              answer: "speed with direction",
              timestamp: "2026-03-24T02:31:00Z",
            },
          }),
        ],
        runtimeSessions: [
          buildRuntimeSessionRecord({ expiresAt: "2099-03-26T02:45:00Z" }),
        ],
      });
      const app = createApp({ getRepository: () => repository });

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

          return new Response(null, { status: 202 });
        },
        async () => {
          const firstResponse = await app.request(
            "https://runtime.lantern.example/runtime/sessions/runtime-session-123/finalize",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer runtime-token-123",
                "content-type": "application/json",
              },
              body: JSON.stringify({ completionState: "completed" }),
            },
          );
          const secondResponse = await app.request(
            "https://runtime.lantern.example/runtime/sessions/runtime-session-123/finalize",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer runtime-token-123",
                "content-type": "application/json",
              },
              body: JSON.stringify({ completionState: "abandoned" }),
            },
          );

          assertEquals(firstResponse.status, 202);
          assertEquals(secondResponse.status, 202);

          const firstBody = (await firstResponse.json()) as {
            accepted: boolean;
            alreadyFinalized: boolean;
            attemptId: string;
            completionState: "completed" | "abandoned" | null;
            scoreGiven: number;
            scoreMaximum: number;
            gradePublished: boolean;
          };
          const secondBody = (await secondResponse.json()) as typeof firstBody;
          const attempt = await repository.getAttemptById("attempt-123");
          const attemptAuditEvents = await repository
            .listAuditEventsByEventType(
              "attempt.finalized",
            );
          const gradeAuditEvents = await repository.listAuditEventsByEventType(
            "grade_publish.succeeded",
          );
          const failedGradeAuditEvents = await repository
            .listAuditEventsByEventType("grade_publish.failed");
          const lineItemBinding = await repository.getLineItemBinding({
            deploymentRecordId: 1,
            packageVersionId: 1,
            contextId: "course-42",
            resourceLinkId: "resource-link-123",
            activityId: "activity-123",
          });
          const gradePublication = await repository
            .getGradePublicationByAttemptId("attempt-123");

          assertEquals(firstBody.accepted, true);
          assertEquals(firstBody.alreadyFinalized, false);
          assertEquals(firstBody.completionState, "completed");
          assertEquals(firstBody.scoreGiven, 100);
          assertEquals(firstBody.scoreMaximum, 100);
          assertEquals(firstBody.gradePublished, true);
          assertEquals(secondBody.alreadyFinalized, true);
          assertEquals(secondBody.completionState, "completed");
          assertEquals(secondBody.scoreGiven, 100);
          assertEquals(secondBody.gradePublished, true);
          assertEquals(attempt?.status, "completed");
          assertEquals(typeof attempt?.finalizedAt, "string");
          assertEquals(attemptAuditEvents.length, 1);
          assertEquals(gradeAuditEvents.length, 1);
          assertEquals(failedGradeAuditEvents.length, 0);
          assertEquals(
            lineItemBinding?.lineItemUrl.includes("/line_items/9"),
            true,
          );
          assertEquals(gradePublication?.status, "published");
        },
      );
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("POST /runtime/sessions/:id/finalize records a failed grade publish when Canvas token exchange fails", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withRuntimeOriginEnv(async () => {
      const repository = createInMemoryPackageReviewRepository({
        packageVersions: [
          buildPackageVersionRecord({
            artifact: {
              snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
              manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
              entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
              digest: "sha256:example-snapshot",
            },
          }),
        ],
        deployments: [
          buildDeploymentRecord({ binding: buildDeploymentBinding() }),
        ],
        attempts: [buildAttemptRecord()],
        attemptEvents: [
          buildAttemptEventRecord({
            id: 1,
            sequence: 1,
            event: {
              type: "answer",
              questionId: "q1",
              answer: "resistance to a change in motion",
              timestamp: "2026-03-24T02:30:00Z",
            },
          }),
        ],
        runtimeSessions: [
          buildRuntimeSessionRecord({ expiresAt: "2099-03-26T02:45:00Z" }),
        ],
      });

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
            "https://runtime.lantern.example/runtime/sessions/runtime-session-123/finalize",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer runtime-token-123",
                "content-type": "application/json",
              },
              body: JSON.stringify({ completionState: "completed" }),
            },
          );

          assertEquals(response.status, 500);

          const attemptAuditEvents = await repository
            .listAuditEventsByEventType(
              "attempt.finalized",
            );
          const failedGradeAuditEvents = await repository
            .listAuditEventsByEventType("grade_publish.failed");
          const attempt = await repository.getAttemptById("attempt-123");

          assertEquals(attempt?.status, "completed");
          assertEquals(attemptAuditEvents.length, 1);
          assertEquals(failedGradeAuditEvents.length, 1);
          assertEquals(
            failedGradeAuditEvents[0]?.detail.code,
            "token_request_failed",
          );
        },
      );
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});
