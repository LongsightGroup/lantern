import { assertEquals } from "@std/assert";
import type {
  DeploymentGradePublicationSnapshot,
  RetryRuntimeSessionLookup,
} from "./types.ts";
import {
  buildAttemptRecord,
  buildControlPlaneDiagnosticItem,
  buildDeploymentRecord,
  buildGradePublicationRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildLaunchServiceClaims,
  buildRuntimeSessionRecord,
} from "../test_helpers/lti.ts";

Deno.test(
  "ops service derives separate health dimensions instead of one opaque control-plane badge",
  async () => {
    const modulePath = `./${"service.ts"}`;
    const opsServiceModule = await import(modulePath);
    const health = opsServiceModule.deriveDeploymentHealth({
      approvalStatus: "approved",
      enabledPackageVersionId: 1,
      binding: buildDeploymentBinding(),
      lastLaunchStatus: "succeeded",
      lastGradePublishStatus: "failed",
      lastNrpsReadStatus: "succeeded",
      brokerVerificationStatus: "passed",
    });

    assertEquals(health.overallStatus, "attention");
    assertEquals(health.dimensions.review.status, "healthy");
    assertEquals(health.dimensions.enablement.status, "healthy");
    assertEquals(health.dimensions.gradePublication.status, "failed");
    assertEquals(health.dimensions.nrps.status, "healthy");
    assertEquals(health.dimensions.brokerVerification.status, "healthy");
  },
);

Deno.test(
  "ops service formats launch, NRPS, and AGS diagnostics into operator-readable summaries without leaking secrets",
  async () => {
    const modulePath = `./${"service.ts"}`;
    const opsServiceModule = await import(modulePath);
    const formatted = opsServiceModule.formatDiagnosticItem(
      buildControlPlaneDiagnosticItem({
        kind: "launch",
        eventType: "launch.rejected",
        code: "deployment_mismatch",
        summary: "Rejected launch before runtime handoff.",
        detail: {
          issuer: "https://canvas.instructure.com",
          clientId: "10000000000001",
          deploymentId: "deployment-999",
          idToken: "secret-id-token",
        },
      }),
    );

    assertEquals(formatted.kind, "launch");
    assertEquals(formatted.operatorSummary.includes("deployment"), true);
    assertEquals(
      JSON.stringify(formatted.detail).includes("secret-id-token"),
      false,
    );
  },
);

Deno.test(
  "ops service retries failed grade publication against the attempt-scoped runtime session instead of the latest deployment session",
  async () => {
    const modulePath = `./${"service.ts"}`;
    const opsServiceModule = await import(modulePath);
    const repository = createInMemoryPackageReviewRepository({
      deployments: [
        buildDeploymentRecord({
          id: 1,
          binding: buildDeploymentBinding(),
        }),
      ],
      attempts: [
        buildAttemptRecord({
          id: 1,
          attemptId: "attempt-123",
          status: "completed",
          completionState: "completed",
          finalizedAt: "2026-03-24T12:31:00Z",
        }),
        buildAttemptRecord({
          id: 2,
          attemptId: "attempt-999",
          userId: "canvas-user-999",
          startedAt: "2026-03-24T12:40:00Z",
        }),
      ],
      gradePublications: [
        buildGradePublicationRecord({
          attemptId: "attempt-123",
          status: "failed",
          gradingProgress: "Failed",
          publishedAt: null,
          updatedAt: "2026-03-24T12:35:00Z",
          errorCode: "canvas_score_rejected",
          errorDetail: {
            httpStatus: 422,
          },
        }),
      ],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          sessionId: "runtime-session-123",
          attemptId: "attempt-123",
          createdAt: "2026-03-24T12:30:00Z",
          expiresAt: "2026-03-25T12:30:00Z",
        }),
        buildRuntimeSessionRecord({
          sessionId: "runtime-session-999",
          sessionToken: "runtime-token-999",
          attemptId: "attempt-999",
          createdAt: "2026-03-24T12:40:00Z",
          expiresAt: "2026-03-25T12:40:00Z",
          services: buildLaunchServiceClaims({
            ags: {
              scope: [
                "https://purl.imsglobal.org/spec/lti-ags/scope/score",
                "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
              ],
              lineitemsUrl:
                "https://canvas.example/api/lti/courses/42/line_items",
              lineitemUrl:
                "https://canvas.example/api/lti/courses/42/line_items/99",
            },
          }),
        }),
      ],
    });
    const publishCalls: Array<{
      attemptId: string;
      publication: DeploymentGradePublicationSnapshot;
      runtimeSession: RetryRuntimeSessionLookup;
    }> = [];

    const result = await opsServiceModule.retryFailedGradePublication({
      repository,
      attemptId: "attempt-123",
      now: () => new Date("2026-03-24T12:45:00Z"),
      publishGrade: (input: {
        attemptId: string;
        publication: DeploymentGradePublicationSnapshot;
        runtimeSession: RetryRuntimeSessionLookup;
      }) => {
        publishCalls.push(input);

        return Promise.resolve({
          status: "published",
          publishedAt: "2026-03-24T12:45:00Z",
        });
      },
    });

    assertEquals(publishCalls.length, 1);
    assertEquals(publishCalls[0]?.attemptId, "attempt-123");
    assertEquals(
      publishCalls[0]?.runtimeSession.sessionId,
      "runtime-session-123",
    );
    assertEquals(result.attemptId, "attempt-123");
    assertEquals(result.runtimeSession.sessionId, "runtime-session-123");
  },
);
