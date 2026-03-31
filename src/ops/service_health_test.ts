import { assertEquals } from "@std/assert";
import { buildControlPlaneDiagnosticItem } from "../test_helpers/package_review.ts";

Deno.test("ops service derives separate health dimensions instead of one opaque control-plane badge", async () => {
  const modulePath = `./${"service.ts"}`;
  const opsServiceModule = await import(modulePath);
  const health = opsServiceModule.deriveDeploymentHealth({
    approvalStatus: "approved",
    enabledPackageVersionId: 1,
    binding: {
      lms: "canvas",
      canvasEnvironment: "production",
      issuer: "https://canvas.instructure.com",
      clientId: "10000000000001",
      deploymentId: "deployment-123",
    },
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
});

Deno.test("ops service formats launch, NRPS, and AGS diagnostics into operator-readable summaries without leaking secrets", async () => {
  const modulePath = `./${"service.ts"}`;
  const opsServiceModule = await import(modulePath);
  const formatted = opsServiceModule.formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: "launch",
      eventType: "launch.rejected",
      code: "unsupported_message_type",
      summary: "Rejected launch before runtime handoff.",
      detail: {
        lms: "sakai",
        messageType: "LtiDeepLinkingRequest",
        supportedMessageType: "LtiResourceLinkRequest",
        issuer: "https://sakai.example",
        clientId: "10000000000001",
        deploymentId: "deployment-999",
        idToken: "secret-id-token",
      },
    }),
  );

  assertEquals(formatted.kind, "launch");
  assertEquals(
    formatted.operatorSummary.includes("resource-link baseline"),
    true,
  );
  assertEquals(formatted.operatorSummary.includes("Canvas"), false);
  assertEquals(
    JSON.stringify(formatted.detail).includes("secret-id-token"),
    false,
  );
});

Deno.test("ops service marks only attempt-scoped AGS failures as retryable diagnostics", async () => {
  const modulePath = `./${"service.ts"}`;
  const opsServiceModule = await import(modulePath);
  const formatted = opsServiceModule.formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: "gradePublication",
      eventType: "grade_publish.failed",
      attemptId: "attempt-123",
      code: "token_request_failed",
      summary: "Canvas AGS score publish failed.",
    }),
    {
      retryableAttemptId: "attempt-123",
    },
  );

  assertEquals(formatted.retryable, true);
  assertEquals(formatted.operatorSummary.includes("control plane"), true);
});
