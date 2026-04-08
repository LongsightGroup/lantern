import { assertEquals, assertExists, assertObjectMatch } from "@std/assert";
import { createApp } from "./app.ts";
import {
  EXAMPLE_SNAPSHOT_ROOT,
  restoreEnv,
  withFetchStub,
  withRuntimeOriginEnv,
} from "./app_test_support.ts";
import {
  buildAttemptEventRecord,
  buildAttemptEvidenceArtifactRecord,
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

const WEB_CHECKUP_SNAPSHOT_ROOT = "examples/apps/web-checkup";

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
            .listAuditEventsByEventType("attempt.finalized");
          const gradeAuditEvents = await repository.listAuditEventsByEventType(
            "grade_publish.succeeded",
          );
          const runtimeExitEvents = await repository.listAuditEventsByEventType(
            "runtime.session.exited",
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
          assertEquals(runtimeExitEvents.length, 1);
          const runtimeExitEvent = runtimeExitEvents[0];

          assertExists(runtimeExitEvent);
          assertObjectMatch(runtimeExitEvent, {
            detail: {
              sandboxModel: "contained_browser_runtime",
              boundary: "app_runtime_origin",
              completionState: "completed",
            },
          });
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

Deno.test("POST /runtime/sessions/:id/finalize accepts browser grader results while keeping publication inside the gateway boundary", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    await withRuntimeOriginEnv(async () => {
      const repository = createInMemoryPackageReviewRepository({
        packageVersions: [
          buildPackageVersionRecord({
            appId: "web-checkup",
            title: "Web Checkup",
            capabilities: [
              "read_launch_context",
              "read_activity_content",
              "submit_attempt_event",
              "submit_evidence_artifact",
              "finalize_attempt",
            ],
            grading: {
              mode: "browser",
              rubricFile: null,
              maxScore: 100,
            },
            manifestJson: {
              app_id: "web-checkup",
              version: "0.1.0",
              title: "Web Checkup",
              grading: {
                mode: "browser",
                max_score: 100,
              },
              authoring: {
                kind: "browser_autograder",
                grader_spec_files: [
                  "/grading/specs/structure.spec.js",
                  "/grading/specs/behavior.spec.js",
                ],
                evidence_example_file: "/evidence/example-output.json",
              },
            },
            artifact: {
              snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
              manifestPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/manifest.json`,
              entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
              digest: "sha256:web-checkup-snapshot",
            },
          }),
        ],
        deployments: [
          buildDeploymentRecord({
            appId: "web-checkup",
            slug: "web-checkup-pilot",
            label: "Web Checkup Pilot",
            binding: buildDeploymentBinding(),
          }),
        ],
        attempts: [
          buildAttemptRecord({
            appId: "web-checkup",
            deploymentSlug: "web-checkup-pilot",
          }),
        ],
        attemptEvidenceArtifacts: [
          buildAttemptEvidenceArtifactRecord({
            artifactId: "artifact-001",
            attemptId: "attempt-123",
            kind: "structured_json",
            fileName: "submission.json",
          }),
        ],
        runtimeSessions: [
          buildRuntimeSessionRecord({
            appId: "web-checkup",
            deploymentSlug: "web-checkup-pilot",
            capabilities: [
              "read_launch_context",
              "read_activity_content",
              "submit_attempt_event",
              "submit_evidence_artifact",
              "finalize_attempt",
            ],
            snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
            entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2099-03-26T02:45:00Z",
          }),
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
          const response = await app.request(
            "https://runtime.lantern.example/runtime/sessions/runtime-session-123/finalize",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer runtime-token-123",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                completionState: "completed",
                browserGraderResult: {
                  scoreGiven: 100,
                  scoreMaximum: 100,
                  specResults: [
                    {
                      source: "/grading/specs/structure.spec.js",
                      result: "passed",
                      failures: [],
                    },
                    {
                      source: "/grading/specs/behavior.spec.js",
                      result: "passed",
                      failures: [],
                    },
                  ],
                },
              }),
            },
          );

          assertEquals(response.status, 202);
          assertObjectMatch(await response.json(), {
            accepted: true,
            scoreGiven: 100,
            scoreMaximum: 100,
            gradePublished: true,
          });
          const attemptAuditEvents = await repository
            .listAuditEventsByEventType(
              "attempt.finalized",
            );

          assertEquals(attemptAuditEvents.length, 1);
          assertObjectMatch(attemptAuditEvents[0]?.detail ?? {}, {
            submissionMode: "anonymous_submission",
            evidenceArtifactCount: 1,
            evidenceArtifacts: [
              {
                artifactId: "artifact-001",
              },
            ],
            browserGraderResult: {
              specResults: [
                {
                  source: "/grading/specs/structure.spec.js",
                },
                {
                  source: "/grading/specs/behavior.spec.js",
                },
              ],
            },
          });
        },
      );
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("POST /runtime/sessions/:id/finalize rejects anonymous submissions that have no stored evidence artifacts", async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [
        buildPackageVersionRecord({
          appId: "web-checkup",
          title: "Web Checkup",
          capabilities: [
            "read_launch_context",
            "read_activity_content",
            "submit_attempt_event",
            "submit_evidence_artifact",
            "finalize_attempt",
          ],
          grading: {
            mode: "browser",
            rubricFile: null,
            maxScore: 100,
          },
          manifestJson: {
            app_id: "web-checkup",
            version: "0.1.0",
            title: "Web Checkup",
            grading: {
              mode: "browser",
              max_score: 100,
            },
            authoring: {
              kind: "browser_autograder",
              grader_spec_files: [
                "/grading/specs/structure.spec.js",
                "/grading/specs/behavior.spec.js",
              ],
              evidence_example_file: "/evidence/example-output.json",
            },
          },
          artifact: {
            snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
            manifestPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/manifest.json`,
            entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
            digest: "sha256:web-checkup-snapshot",
          },
        }),
      ],
      attempts: [
        buildAttemptRecord({
          appId: "web-checkup",
          deploymentSlug: "web-checkup-pilot",
        }),
      ],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          appId: "web-checkup",
          deploymentSlug: "web-checkup-pilot",
          capabilities: [
            "read_launch_context",
            "read_activity_content",
            "submit_attempt_event",
            "submit_evidence_artifact",
            "finalize_attempt",
          ],
          snapshotRoot: WEB_CHECKUP_SNAPSHOT_ROOT,
          entrypointPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/dist/index.html`,
          contentPath: `${WEB_CHECKUP_SNAPSHOT_ROOT}/content/activity.json`,
          expiresAt: "2099-03-26T02:45:00Z",
        }),
      ],
    });
    const app = createApp({ getRepository: () => repository });

    const response = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/finalize",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          completionState: "completed",
          browserGraderResult: {
            scoreGiven: 100,
            scoreMaximum: 100,
            specResults: [
              {
                source: "/grading/specs/structure.spec.js",
                result: "passed",
                failures: [],
              },
              {
                source: "/grading/specs/behavior.spec.js",
                result: "passed",
                failures: [],
              },
            ],
          },
        }),
      },
    );
    const body = (await response.json()) as {
      accepted: boolean;
      denial: {
        code: string;
        capability: string | null;
      };
    };

    assertEquals(response.status, 409);
    assertEquals(body.accepted, false);
    assertEquals(body.denial.code, "anonymous_evidence_required");
    assertEquals(body.denial.capability, "finalize_attempt");
  });
});

Deno.test("POST /runtime/sessions/:id/score-proposal accepts typed app proposals without direct grade writes", async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({ expiresAt: "2099-03-26T02:45:00Z" }),
      ],
    });
    const response = await createApp({
      getRepository: () => repository,
    }).request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/score-proposal",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scoreGiven: 7,
          scoreMaximum: 10,
        }),
      },
    );

    assertEquals(response.status, 202);
    assertObjectMatch(await response.json(), {
      accepted: true,
      scoreProposal: {
        scoreGiven: 7,
        scoreMaximum: 10,
      },
    });
    assertEquals(
      await repository.getGradePublicationByAttemptId("attempt-123"),
      null,
    );
    assertEquals(
      (await repository.getAttemptById("attempt-123"))?.finalizedAt,
      null,
    );
    const proposalEvents = await repository.listAuditEventsByEventType(
      "runtime.score_proposal.accepted",
    );

    assertEquals(proposalEvents.length, 1);
  });
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
                "x-real-ip": "203.0.113.80",
              },
              body: JSON.stringify({ completionState: "completed" }),
            },
          );

          assertEquals(response.status, 500);

          const attemptAuditEvents = await repository
            .listAuditEventsByEventType("attempt.finalized");
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
          assertObjectMatch(failedGradeAuditEvents[0]?.detail.request ?? {}, {
            method: "POST",
            path: "/runtime/sessions/runtime-session-123/finalize",
            bodyKeys: ["completionState"],
            contentType: "application/json",
            clientIpMasked: "203.0.113.x",
          });
        },
      );
    });
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});
