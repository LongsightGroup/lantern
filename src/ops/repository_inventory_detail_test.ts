import { assertEquals, assertExists } from "@std/assert";
import { buildAuditEventRecord } from "../test_helpers/package_review.ts";
import { insertAuditEvent } from "./repository_test_core_support.ts";
import { withSeededOpsRepositoryTest } from "./repository_inventory_test_support.ts";

Deno.test("ops repository returns deployment detail snapshots with recent launches, the latest checks, and only failed diagnostics", async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 40,
          deploymentRecordId: 1,
          eventType: "interop.path_used",
          status: "accepted",
          summary:
            "Lantern tolerated bounded target_link_uri drift during launch validation.",
          detail: {
            scope: "launch",
            path: "target_link_uri_drift",
            ltiProfileId: "governedCompatibility",
            ltiProfileSource: "lanternDefault",
          },
          occurredAt: "2026-03-24T12:34:30Z",
        }),
      );
    } finally {
      client.release();
    }

    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    assertEquals(detail.inventory.deploymentSlug, "chapter-4-asteroids-pilot");
    assertEquals(detail.latestLaunch?.attemptId, "attempt-123");
    assertEquals(detail.recentLaunches.length, 1);
    assertEquals(detail.recentLaunches[0]?.userId, "opaque-user-123");
    assertEquals(detail.recentLaunches[0]?.userDisplayName, "Ada Lovelace");
    assertEquals(detail.recentLaunches[0]?.userEmail, "ada@example.com");
    assertEquals(detail.recentLaunches[0]?.userLogin, "adal");
    assertEquals(detail.recentLaunches[0]?.contextId, "course-42");
    assertEquals(
      detail.recentLaunches[0]?.ltiProfileId,
      "governedCompatibility",
    );
    assertEquals(detail.recentLaunches[0]?.ltiProfileSource, "lanternDefault");
    assertEquals(
      detail.latestLaunch?.detail.ltiProfileId,
      "governedCompatibility",
    );
    assertEquals(detail.latestNrpsRead?.status, "succeeded");
    assertEquals(
      detail.latestNrpsRead?.detail.ltiProfileSource,
      "lanternDefault",
    );
    assertEquals(detail.latestGradePublish?.errorCode, "canvas_score_rejected");
    assertExists(
      (
        detail as unknown as {
          latestCompatibilityPath?: {
            status: string;
            summary: string;
            detail: Record<string, unknown>;
          } | null;
        }
      ).latestCompatibilityPath,
    );
    assertEquals(
      (
        detail as unknown as {
          latestCompatibilityPath?: {
            status: string;
            summary: string;
            detail: Record<string, unknown>;
          } | null;
        }
      ).latestCompatibilityPath?.status,
      "succeeded",
    );
    assertEquals(
      (
        detail as unknown as {
          latestCompatibilityPath?: {
            status: string;
            summary: string;
            detail: Record<string, unknown>;
          } | null;
        }
      ).latestCompatibilityPath?.summary,
      "Lantern tolerated bounded target_link_uri drift during launch validation.",
    );
    assertEquals(
      (
        detail as unknown as {
          latestCompatibilityPath?: {
            status: string;
            summary: string;
            detail: Record<string, unknown>;
          } | null;
        }
      ).latestCompatibilityPath?.detail.path,
      "target_link_uri_drift",
    );
    assertEquals(
      (
        detail as unknown as {
          latestCompatibilityPath?: {
            status: string;
            summary: string;
            detail: Record<string, unknown>;
          } | null;
        }
      ).latestCompatibilityPath?.detail.scope,
      "launch",
    );
    assertEquals(detail.diagnostics.length, 1);
    assertEquals(detail.diagnostics[0]?.eventType, "grade_publish.failed");
  });
});

Deno.test("ops repository returns the latest deployment-scoped AGS smoke verification result for the viewed deployment", async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 30,
          deploymentRecordId: 2,
          eventType: "deployment.ags_smoke_verified",
          status: "failed",
          summary: "Moodle AGS smoke verification failed.",
          detail: {
            lms: "moodle",
            agsCapable: true,
            publicationStatus: "failed",
            lineItemUrl:
              "https://moodle.example/mod/lti/services.php/2/lineitems/9",
            ltiProfileId: "certification",
            ltiProfileSource: "deploymentOverride",
            error: {
              code: "score_publish_failed",
              message: "Moodle score publish failed with status 500.",
            },
          },
          occurredAt: "2026-03-24T12:38:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 31,
          deploymentRecordId: 3,
          eventType: "deployment.ags_smoke_verified",
          status: "succeeded",
          summary: "Sakai AGS smoke verification succeeded.",
          detail: {
            lms: "sakai",
            agsCapable: true,
            publicationStatus: "succeeded",
            lineItemUrl:
              "https://sakai.example/direct/lti/lineitems/course-42/items/9",
            ltiProfileId: "governedCompatibility",
            ltiProfileSource: "lanternDefault",
          },
          occurredAt: "2026-03-24T12:39:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const moodleDetail = await repository.getControlPlaneDeploymentDetail(2);
    const sakaiDetail = await repository.getControlPlaneDeploymentDetail(3);

    assertExists(moodleDetail);
    assertEquals(moodleDetail.latestAgsSmoke?.status, "failed");
    assertEquals(
      moodleDetail.latestAgsSmoke?.summary,
      "Moodle AGS smoke verification failed.",
    );
    assertEquals(moodleDetail.latestAgsSmoke?.detail.lms, "moodle");
    assertEquals(moodleDetail.latestAgsSmoke?.detail.agsCapable, true);
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.publicationStatus,
      "failed",
    );
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.lineItemUrl,
      "https://moodle.example/mod/lti/services.php/2/lineitems/9",
    );
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.ltiProfileId,
      "certification",
    );
    assertEquals(
      moodleDetail.latestAgsSmoke?.detail.ltiProfileSource,
      "deploymentOverride",
    );

    assertExists(sakaiDetail);
    assertEquals(sakaiDetail.latestAgsSmoke?.status, "succeeded");
    assertEquals(
      sakaiDetail.latestAgsSmoke?.summary,
      "Sakai AGS smoke verification succeeded.",
    );
    assertEquals(sakaiDetail.latestAgsSmoke?.detail.lms, "sakai");
    assertEquals(
      sakaiDetail.latestAgsSmoke?.detail.publicationStatus,
      "succeeded",
    );
    assertEquals(
      sakaiDetail.latestAgsSmoke?.detail.ltiProfileSource,
      "lanternDefault",
    );
  });
});

Deno.test("ops repository exposes runtime session and sandbox boundary evidence for deployment detail snapshots", async () => {
  await withSeededOpsRepositoryTest(async (pool, repository) => {
    const client = await pool.connect();

    try {
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 41,
          deploymentRecordId: 1,
          attemptId: "attempt-123",
          eventType: "runtime.session.started",
          status: "accepted",
          summary:
            "Started the reviewed runtime session inside Lantern's contained browser boundary.",
          detail: {
            sessionId: "runtime-session-123",
            sandboxModel: "contained_browser_runtime",
            boundary: "app_runtime_origin",
            route: "session",
            capabilityCount: 6,
          },
          occurredAt: "2026-03-24T12:36:00Z",
        }),
      );
      await insertAuditEvent(
        client,
        buildAuditEventRecord({
          id: 42,
          deploymentRecordId: 1,
          attemptId: "attempt-123",
          eventType: "runtime.session.exited",
          status: "accepted",
          summary:
            "Exited the reviewed runtime through Lantern's finalize boundary.",
          detail: {
            sessionId: "runtime-session-123",
            sandboxModel: "contained_browser_runtime",
            boundary: "app_runtime_origin",
            route: "finalize",
            completionState: "completed",
            scoreGiven: 8,
            scoreMaximum: 10,
            gradePublished: false,
            submissionMode: "anonymous_submission",
            evidenceArtifactCount: 1,
            evidenceArtifacts: [
              {
                artifactId: "artifact-001",
                kind: "structured_json",
                fileName: "submission.json",
              },
            ],
            browserGraderResult: {
              scoreGiven: 8,
              scoreMaximum: 10,
              specResults: [
                {
                  source: "/grading/specs/checks.spec.js",
                  result: "passed",
                  failures: [],
                },
              ],
            },
          },
          occurredAt: "2026-03-24T12:37:00Z",
        }),
      );
    } finally {
      client.release();
    }

    const detail = await repository.getControlPlaneDeploymentDetail(1);

    assertExists(detail);
    const runtimeDetail = detail as typeof detail & {
      latestRuntimeSession?: {
        sessionId: string | null;
        sandboxModel: string | null;
        boundary: string | null;
        route: string | null;
        attemptId: string | null;
      } | null;
      latestRuntimeOutcome?: {
        eventType: string;
        sessionId: string | null;
        sandboxModel: string | null;
        boundary: string | null;
        route: string | null;
      } | null;
      latestAnonymousEvidence?: Array<{
        artifactId: string;
        artifactUrl: string;
      }>;
    };

    assertExists(runtimeDetail.latestRuntimeSession);
    assertEquals(
      runtimeDetail.latestRuntimeSession?.sessionId,
      "runtime-session-123",
    );
    assertEquals(
      runtimeDetail.latestRuntimeSession?.sandboxModel,
      "contained_browser_runtime",
    );
    assertEquals(
      runtimeDetail.latestRuntimeSession?.boundary,
      "app_runtime_origin",
    );
    assertEquals(runtimeDetail.latestRuntimeSession?.route, "session");
    assertEquals(runtimeDetail.latestRuntimeSession?.attemptId, "attempt-123");
    assertExists(runtimeDetail.latestRuntimeOutcome);
    assertEquals(
      runtimeDetail.latestRuntimeOutcome?.eventType,
      "runtime.session.exited",
    );
    assertEquals(
      runtimeDetail.latestRuntimeOutcome?.sessionId,
      "runtime-session-123",
    );
    assertEquals(
      runtimeDetail.latestRuntimeOutcome?.sandboxModel,
      "contained_browser_runtime",
    );
    assertEquals(
      runtimeDetail.latestRuntimeOutcome?.boundary,
      "app_runtime_origin",
    );
    assertEquals(runtimeDetail.latestRuntimeOutcome?.route, "finalize");
    assertEquals(runtimeDetail.latestAnonymousEvidence?.length, 1);
    assertEquals(
      runtimeDetail.latestAnonymousEvidence?.[0]?.artifactId,
      "artifact-001",
    );
    assertEquals(
      runtimeDetail.latestAnonymousEvidence?.[0]?.artifactUrl,
      "/admin/packages/chapter-4-asteroids/deployment/evidence/artifact-001",
    );
  });
});
