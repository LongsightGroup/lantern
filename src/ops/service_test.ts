import { assertEquals, assertRejects } from "@std/assert";
import { restoreEnv, withFetchStub } from "../test_helpers/fetch_stub.ts";
import {
  buildAttemptRecord,
  buildControlPlaneDiagnosticItem,
  buildDeploymentRecord,
  buildGradePublicationRecord,
  buildLineItemBindingRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import {
  buildDeploymentBinding,
  buildLaunchServiceClaims,
  buildRuntimeSessionRecord,
  getTestToolPrivateJwkEnvValue,
} from "../test_helpers/lti.ts";
import { formatDiagnosticItem } from "./service.ts";

Deno.test("ops service retries failed grade publication against the attempt-scoped runtime session and updates the existing ledger row", async () => {
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
    accessToken: string;
    lineItemUrl: string;
    platformUserId: string;
  }> = [];
  const tokenRequests: Array<{ deploymentId?: string }> = [];

  const result = await opsServiceModule.retryFailedGradePublication({
    repository,
    attemptId: "attempt-123",
    now: () => new Date("2026-03-24T12:45:00Z"),
    requestAccessToken: (request: { deploymentId?: string }) => {
      tokenRequests.push(request);

      return Promise.resolve({
        accessToken: `canvas-access-token-${tokenRequests.length}`,
      });
    },
    publishScore: (
      input: {
        accessToken: string;
        lineItemUrl: string;
        platformUserId: string;
        retryUnauthorized?: () => Promise<string>;
      },
    ) => {
      publishCalls.push(input);
      if (publishCalls.length === 1 && input.retryUnauthorized !== undefined) {
        return input.retryUnauthorized().then(() => ({
          accepted: true,
          status: 200,
        }));
      }
      return Promise.resolve({ accepted: true, status: 200 });
    },
  });
  const savedPublication = await repository.getGradePublicationByAttemptId(
    "attempt-123",
  );
  const interopEvents = await repository.listAuditEventsByEventType(
    "interop.path_used",
  );

  assertEquals(publishCalls.length, 1);
  assertEquals(publishCalls[0]?.accessToken, "canvas-access-token-1");
  assertEquals(
    publishCalls[0]?.lineItemUrl,
    "https://canvas.example/api/lti/courses/42/line_items/9",
  );
  assertEquals(publishCalls[0]?.platformUserId, "canvas-user-123");
  assertEquals(tokenRequests[0]?.deploymentId, "deployment-123");
  assertEquals(tokenRequests[1]?.deploymentId, "deployment-123");
  assertEquals(result.attemptId, "attempt-123");
  assertEquals(result.publication.status, "published");
  assertEquals(savedPublication?.id, 1);
  assertEquals(savedPublication?.status, "published");
  assertEquals(savedPublication?.publishedAt, "2026-03-24T12:45:00.000Z");
  assertEquals(
    interopEvents.some((event) => event.detail.path === "service_401_retry"),
    true,
  );
  assertEquals(
    interopEvents.some((event) =>
      event.detail.ltiProfileId === "governedCompatibility"
    ),
    true,
  );
});

Deno.test("ops service blocks retry when no failed publication or AGS context remains for the attempt", async () => {
  const modulePath = `./${"service.ts"}`;
  const opsServiceModule = await import(modulePath);
  const missingPublicationRepository = createInMemoryPackageReviewRepository({
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: "attempt-123",
        status: "published",
        publishedAt: "2026-03-24T12:35:00Z",
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        attemptId: "attempt-123",
        expiresAt: "2026-03-25T12:30:00Z",
      }),
    ],
  });
  const missingAgsRepository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 1,
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 2,
        attemptId: "attempt-456",
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: "attempt-456",
        status: "failed",
        publishedAt: null,
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        attemptId: "attempt-456",
        services: buildLaunchServiceClaims({
          ags: null,
        }),
      }),
    ],
  });

  await assertRejects(
    () =>
      opsServiceModule.retryFailedGradePublication({
        repository: missingPublicationRepository,
        attemptId: "attempt-123",
        requestAccessToken: () =>
          Promise.resolve({
            accessToken: "unused",
          }),
        publishScore: () => Promise.resolve({ accepted: true, status: 200 }),
      }),
    Error,
    "could not find a failed grade publication",
  );

  await assertRejects(
    () =>
      opsServiceModule.retryFailedGradePublication({
        repository: missingAgsRepository,
        attemptId: "attempt-456",
        requestAccessToken: () =>
          Promise.resolve({
            accessToken: "unused",
          }),
        publishScore: () => Promise.resolve({ accepted: true, status: 200 }),
      }),
    Error,
    "does not include AGS service context",
  );
});

Deno.test("ops service formats governed runtime failures with runtime-specific operator summaries", () => {
  const capabilityDenied = formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: "runtime",
      eventType: "runtime.capability.denied",
      code: "capability_not_granted",
      boundaryDenialCategory: "policyDenied",
      summary: "Denied reviewed app capability write_local_state.",
      detail: {
        capability: "write_local_state",
        category: "policyDenied",
        sandboxModel: "contained_browser_runtime",
        boundary: "app_runtime_origin",
      },
    }),
  );
  const timeout = formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: "runtime",
      eventType: "runtime.session.timeout",
      code: "session_expired",
      summary: "Runtime session expired before the reviewed app could continue.",
      detail: {
        sandboxModel: "contained_browser_runtime",
        boundary: "app_runtime_origin",
      },
    }),
  );
  const integrityFailure = formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: "runtime",
      eventType: "runtime.session.integrity_failed",
      code: "package_version_missing",
      summary: "Reviewed runtime integrity checks blocked this session.",
      detail: {
        sandboxModel: "contained_browser_runtime",
        boundary: "app_runtime_origin",
      },
    }),
  );

  assertEquals(
    capabilityDenied.operatorSummary,
    "Lantern denied reviewed app capability write_local_state at the governed runtime boundary.",
  );
  assertEquals(
    timeout.operatorSummary,
    "Runtime session timed out before the reviewed app could continue.",
  );
  assertEquals(
    integrityFailure.operatorSummary,
    "Reviewed runtime integrity checks blocked this session before app code could continue.",
  );
});

Deno.test("runtime gateway exposes the shared governed grade-publication helper used by finalize and retry", async () => {
  const modulePath = `../runtime/${"gateway.ts"}`;
  const gatewayModule = await import(modulePath);
  const repository = createInMemoryPackageReviewRepository({
    gradePublications: [
      buildGradePublicationRecord({
        id: 1,
        attemptId: "attempt-123",
        status: "failed",
        publishedAt: null,
        updatedAt: "2026-03-24T12:35:00Z",
      }),
    ],
  });
  const result = await gatewayModule.publishGovernedGradePublication({
    repository,
    attemptId: "attempt-123",
    publication: buildGradePublicationRecord({
      id: 1,
      attemptId: "attempt-123",
      status: "failed",
      publishedAt: null,
      updatedAt: "2026-03-24T12:35:00Z",
    }),
    accessToken: "canvas-access-token",
    now: () => new Date("2026-03-24T12:45:00Z"),
    publishScore: () => Promise.resolve({ accepted: true, status: 200 }),
  });
  const savedPublication = await repository.getGradePublicationByAttemptId(
    "attempt-123",
  );

  assertEquals(result.gradePublishedNow, true);
  assertEquals(savedPublication?.id, 1);
  assertEquals(savedPublication?.status, "published");
  assertEquals(savedPublication?.publishedAt, "2026-03-24T12:45:00.000Z");
});

Deno.test("runtime publication retries one Canvas 401 when governed compatibility allows the saved service retry path", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const modulePath = `../runtime/${"gateway_publication.ts"}`;
  const gatewayPublicationModule = await import(modulePath);
  const deployment = buildDeploymentRecord({
    id: 1,
    enabledPackageVersionId: 1,
    enabledPackageVersion: "0.1.0",
    binding: buildDeploymentBinding(),
  });
  const attempt = buildAttemptRecord({
    id: 1,
    attemptId: "attempt-123",
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    status: "completed",
    completionState: "completed",
    finalizedAt: "2026-03-24T12:31:00Z",
  });
  const session = buildRuntimeSessionRecord({
    attemptId: attempt.attemptId,
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    packageVersion: "0.1.0",
    services: buildLaunchServiceClaims({
      ags: {
        lineitemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
      },
    }),
  });
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: "approved",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const repository = createInMemoryPackageReviewRepository({
    deployments: [deployment],
    attempts: [attempt],
    runtimeSessions: [session],
    packageVersions: [packageVersion],
    lineItemBindings: [
      buildLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: packageVersion.id,
        contextId: attempt.contextId,
        resourceLinkId: attempt.resourceLinkId,
        activityId: attempt.activityId,
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "governedCompatibility",
      updatedAt: "2026-03-24T12:25:00Z",
    },
  });
  const scoreAuthorizations: string[] = [];
  let tokenRequests = 0;

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const result = await withFetchStub(
      (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          tokenRequests += 1;

          return new Response(
            JSON.stringify({
              access_token: `canvas-access-token-${tokenRequests}`,
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
          url ===
            "https://canvas.example/api/lti/courses/42/line_items/9/scores" &&
          method === "POST"
        ) {
          scoreAuthorizations.push(headers.get("authorization") ?? "");

          if (headers.get("authorization") === "Bearer canvas-access-token-1") {
            return new Response(null, { status: 401 });
          }

          return new Response(null, { status: 202 });
        }

        throw new Error(`Unexpected runtime request ${method} ${url}`);
      },
      async () =>
        await gatewayPublicationModule.publishRuntimeAttemptScore({
          repository,
          session,
          attempt,
          packageVersion,
          score: {
            scoreGiven: 85,
            scoreMaximum: 100,
          },
          now: () => new Date("2026-03-24T12:45:00Z"),
        }),
    );
    const interopEvents = await repository.listAuditEventsByEventType(
      "interop.path_used",
    );

    assertEquals(result.gradePublishedNow, true);
    assertEquals(result.publishError, null);
    assertEquals(result.gradePublication?.status, "published");
    assertEquals(tokenRequests, 2);
    assertEquals(scoreAuthorizations, [
      "Bearer canvas-access-token-1",
      "Bearer canvas-access-token-2",
    ]);
    assertEquals(interopEvents.length, 1);
    assertEquals(interopEvents[0]?.detail.path, "service_401_retry");
    assertEquals(
      interopEvents[0]?.detail.ltiProfileId,
      "governedCompatibility",
    );
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("runtime publication fails on Canvas 401 without retry when certification disables the saved service retry path", async () => {
  const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  const modulePath = `../runtime/${"gateway_publication.ts"}`;
  const gatewayPublicationModule = await import(modulePath);
  const deployment = buildDeploymentRecord({
    id: 1,
    enabledPackageVersionId: 1,
    enabledPackageVersion: "0.1.0",
    binding: buildDeploymentBinding(),
  });
  const attempt = buildAttemptRecord({
    id: 1,
    attemptId: "attempt-123",
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    status: "completed",
    completionState: "completed",
    finalizedAt: "2026-03-24T12:31:00Z",
  });
  const session = buildRuntimeSessionRecord({
    attemptId: attempt.attemptId,
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    packageVersion: "0.1.0",
    services: buildLaunchServiceClaims({
      ags: {
        lineitemUrl: "https://canvas.example/api/lti/courses/42/line_items/9",
      },
    }),
  });
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: "approved",
    reviewedAt: "2026-03-23T18:05:00Z",
  });
  const repository = createInMemoryPackageReviewRepository({
    deployments: [deployment],
    attempts: [attempt],
    runtimeSessions: [session],
    packageVersions: [packageVersion],
    lineItemBindings: [
      buildLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: packageVersion.id,
        contextId: attempt.contextId,
        resourceLinkId: attempt.resourceLinkId,
        activityId: attempt.activityId,
      }),
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "certification",
      updatedAt: "2026-03-24T12:25:00Z",
    },
  });
  const scoreAuthorizations: string[] = [];
  let tokenRequests = 0;

  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const result = await withFetchStub(
      (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
          tokenRequests += 1;

          return new Response(
            JSON.stringify({
              access_token: "canvas-access-token-1",
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
          url ===
            "https://canvas.example/api/lti/courses/42/line_items/9/scores" &&
          method === "POST"
        ) {
          scoreAuthorizations.push(headers.get("authorization") ?? "");
          return new Response(null, { status: 401 });
        }

        throw new Error(`Unexpected runtime request ${method} ${url}`);
      },
      async () =>
        await gatewayPublicationModule.publishRuntimeAttemptScore({
          repository,
          session,
          attempt,
          packageVersion,
          score: {
            scoreGiven: 85,
            scoreMaximum: 100,
          },
          now: () => new Date("2026-03-24T12:45:00Z"),
        }),
    );
    const interopEvents = await repository.listAuditEventsByEventType(
      "interop.path_used",
    );

    assertEquals(result.gradePublishedNow, false);
    assertEquals(result.publishError?.code, "score_publish_failed");
    assertEquals(
      result.publishError?.message,
      "Canvas score publish failed with status 401.",
    );
    assertEquals(result.gradePublication?.status, "failed");
    assertEquals(tokenRequests, 1);
    assertEquals(scoreAuthorizations, ["Bearer canvas-access-token-1"]);
    assertEquals(interopEvents.length, 0);
  } finally {
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
  }
});

Deno.test("ops service fails a manual retry Canvas 401 without retry when certification disables the saved service retry path", async () => {
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
    ],
    lanternLtiProfileSettings: {
      defaultLtiProfile: "certification",
      updatedAt: "2026-03-24T12:25:00Z",
    },
  });
  const publishCalls: Array<{
    accessToken: string;
    lineItemUrl: string;
    platformUserId: string;
    retryUnauthorized?: () => Promise<string>;
  }> = [];
  const tokenRequests: Array<{ deploymentId?: string }> = [];

  const result = await opsServiceModule.retryFailedGradePublication({
    repository,
    attemptId: "attempt-123",
    now: () => new Date("2026-03-24T12:45:00Z"),
    requestAccessToken: (request: { deploymentId?: string }) => {
      tokenRequests.push(request);

      return Promise.resolve({
        accessToken: `canvas-access-token-${tokenRequests.length}`,
      });
    },
    publishScore: (
      input: {
        accessToken: string;
        lineItemUrl: string;
        platformUserId: string;
        retryUnauthorized?: () => Promise<string>;
      },
    ) => {
      publishCalls.push(input);
      if (input.retryUnauthorized !== undefined) {
        return input.retryUnauthorized().then(() => ({
          accepted: true,
          status: 200,
        }));
      }

      return Promise.reject(
        new Error("Canvas score publish failed with status 401."),
      );
    },
  });
  const savedPublication = await repository.getGradePublicationByAttemptId(
    "attempt-123",
  );
  const interopEvents = await repository.listAuditEventsByEventType(
    "interop.path_used",
  );

  assertEquals(publishCalls.length, 1);
  assertEquals(publishCalls[0]?.retryUnauthorized === undefined, true);
  assertEquals(tokenRequests.length, 1);
  assertEquals(result.publication.status, "failed");
  assertEquals(savedPublication?.status, "failed");
  assertEquals(savedPublication?.publishedAt, null);
  assertEquals(savedPublication?.errorCode, "score_publish_failed");
  assertEquals(interopEvents.length, 0);
});
