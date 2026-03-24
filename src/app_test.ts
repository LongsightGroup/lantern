import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { resolveCanvasIssuer } from "./lti/config.ts";
import { CANVAS_LTI_SCOPES } from "./lti/types.ts";
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildDeploymentRecord,
  buildImportedPackageVersion,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import {
  buildCanvasLoginRequest,
  buildDeploymentBinding,
  buildLoginStateRecord,
  buildRuntimeSessionRecord,
  getTestCanvasJwks,
  getTestToolPrivateJwkEnvValue,
  signCanvasIdToken,
} from "./test_helpers/lti.ts";

const EXAMPLE_SNAPSHOT_ROOT = "examples/apps/chapter-4-asteroids";

Deno.test("GET / responds with html", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/");

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("content-type"),
    "text/html; charset=UTF-8",
  );

  const body = await response.text();
  assertEquals(body.includes("Lantern"), true);
});

Deno.test("GET /health responds with ok", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/health");

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(await response.json(), { ok: true });
});

Deno.test("GET /admin/packages renders the demo-first zero state when no versions exist", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Start with the demo app");
  assertStringIncludes(body, "Chapter 4 Asteroids");
  assertStringIncludes(body, "Import the demo learning game");
});

Deno.test("GET /admin/packages renders exact version rows and approval-state badges", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "pending",
      }),
    ],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "<strong>Version</strong> 0.2.0");
  assertStringIncludes(body, "Pending review");
  assertStringIncludes(body, "Approved");
  assertStringIncludes(body, "Open dossier");
  assertStringIncludes(body, "Version picker");
});

Deno.test("POST /admin/packages/import-demo imports the demo package and redirects to the dossier", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({
    getRepository: () => repository,
    importDemoPackage: () =>
      Promise.resolve(
        buildImportedPackageVersion({
          version: "0.1.0",
        }),
      ),
  });

  const response = await app.request(
    "http://localhost/admin/packages/import-demo",
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
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionByAppVersion(
    "chapter-4-asteroids",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/:id/approve records notes and keeps status visible on reload", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord({ id: 7 })],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  formData.set("reviewNotes", "Ready for the pilot deployment.");

  const response = await app.request(
    "http://localhost/admin/packages/7/approve",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionById(7);
  assertEquals(saved?.approvalStatus, "approved");
  assertEquals(saved?.reviewNotes, "Ready for the pilot deployment.");
  const auditEvents = await repository.listAuditEventsByEventType(
    "package.approved",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.packageVersionId, 7);

  const detailResponse = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );
  const detailBody = await detailResponse.text();

  assertStringIncludes(detailBody, "Approved");
  assertStringIncludes(detailBody, "Ready for the pilot deployment.");
});

Deno.test("POST /admin/packages/:id/reject refuses to reverse a frozen decision", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 9,
        approvalStatus: "approved",
        reviewNotes: "Already approved.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  const response = await app.request(
    "http://localhost/admin/packages/9/reject",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, "Rejection blocked");
  assertStringIncludes(body, "already been reviewed and cannot change state");
});

Deno.test("POST /admin/packages/:appId/deployment/pin stores the exact approved version id", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 6,
        version: "0.2.0",
        approvalStatus: "pending",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
      }),
    ],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  formData.set("packageVersionId", "5");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/pin",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/deployment",
  );

  const deployment = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  assertEquals(deployment?.enabledPackageVersionId, 5);
  assertEquals(deployment?.enabledPackageVersion, "0.1.0");
  const auditEvents = await repository.listAuditEventsByEventType(
    "deployment.version_pinned",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.deploymentRecordId, 3);
});

Deno.test("POST /admin/packages/:appId/deployment/install saves the Canvas binding and redirects back to deployment detail", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8000");

  try {
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
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
    });
    const formData = new FormData();

    formData.set("canvasEnvironment", "production");
    formData.set("clientId", "10000000000001");
    formData.set("deploymentId", "deployment-123");

    const response = await app.request(
      "http://localhost/admin/packages/chapter-4-asteroids/deployment/install",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
        },
        body: formData,
      },
    );

    assertEquals(response.status, 303);
    assertEquals(
      response.headers.get("location"),
      "/admin/packages/chapter-4-asteroids/deployment",
    );

    const deployment = await repository.getDeploymentBySlug(
      "chapter-4-asteroids-pilot",
    );
    assertEquals(
      deployment?.binding?.issuer,
      resolveCanvasIssuer("production"),
    );
    assertEquals(deployment?.binding?.clientId, "10000000000001");
    assertEquals(deployment?.binding?.deploymentId, "deployment-123");
    const auditEvents = await repository.listAuditEventsByEventType(
      "deployment.binding_saved",
    );
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.deploymentRecordId, 3);
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /admin/packages/:appId/deployment renders the Canvas install sequence and saved binding", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:8000");

  try {
    const response = await createApp({
      getRepository: () =>
        createInMemoryPackageReviewRepository({
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
        }),
    }).request(
      "http://localhost/admin/packages/chapter-4-asteroids/deployment",
    );

    assertEquals(response.status, 200);
    const body = await response.text();

    assertStringIncludes(body, "One supported setup path");
    assertStringIncludes(body, "Config URL");
    assertStringIncludes(body, "Canvas Client ID");
    assertStringIncludes(body, "Launch-ready configuration saved");
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
  }
});

Deno.test("GET /lti/canvas/config.json publishes the pilot Canvas config document", async () => {
  const previousOrigin = Deno.env.get("APP_ORIGIN");
  const previousJwk = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
  Deno.env.set("APP_ORIGIN", "http://localhost:8000");
  Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

  try {
    const response = await createApp({
      getRepository: () => createInMemoryPackageReviewRepository(),
    }).request("http://localhost/lti/canvas/config.json");

    assertEquals(response.status, 200);
    const body = await response.json() as {
      oidc_initiation_url: string;
      scopes: string[];
      extensions: Array<
        { settings: { placements: Array<{ placement: string }> } }
      >;
    };

    assertEquals(typeof body.oidc_initiation_url, "string");
    assertEquals(body.scopes, [...CANVAS_LTI_SCOPES]);
    assertEquals(
      body.extensions[0]?.settings.placements[0]?.placement,
      "course_navigation",
    );
  } finally {
    restoreEnv("APP_ORIGIN", previousOrigin);
    restoreEnv("LTI_TOOL_PRIVATE_JWK", previousJwk);
  }
});

Deno.test("GET /lti/login persists login state and redirects to the Canvas authorization endpoint", async () => {
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        binding: buildDeploymentBinding(),
      }),
    ],
  });
  const loginRequest = buildCanvasLoginRequest();
  const response = await createApp({
    getRepository: () => repository,
  }).request(
    `http://localhost/lti/login?iss=${
      encodeURIComponent(loginRequest.iss)
    }&login_hint=${
      encodeURIComponent(loginRequest.loginHint)
    }&target_link_uri=${
      encodeURIComponent(loginRequest.targetLinkUri)
    }&client_id=${encodeURIComponent(loginRequest.clientId)}&deployment_id=${
      encodeURIComponent(loginRequest.deploymentId)
    }&lti_message_hint=${
      encodeURIComponent(loginRequest.ltiMessageHint ?? "")
    }`,
  );

  assertEquals(response.status, 302);

  const location = response.headers.get("location");

  if (!location) {
    throw new Error("Expected Canvas authorization redirect location.");
  }

  const redirected = new URL(location);
  const state = redirected.searchParams.get("state");

  if (!state) {
    throw new Error("Expected saved login state in the Canvas redirect.");
  }

  const saved = await repository.getLoginStateByState(state);

  assertEquals(
    redirected.origin + redirected.pathname,
    "https://sso.canvaslms.com/api/lti/authorize_redirect",
  );
  assertEquals(saved?.clientId, loginRequest.clientId);
  assertEquals(saved?.deploymentId, loginRequest.deploymentId);
});

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
        expiresAt: "2026-03-25T02:45:00Z",
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
          headers: {
            "content-type": "application/json",
          },
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
        saved.services.nrps?.contextMembershipsUrl?.includes(
          "names_and_roles",
        ),
        true,
      );
      assertEquals(attempt?.attemptId, saved.attemptId);
      assertEquals(auditEvents.length, 1);
      assertEquals(auditEvents[0]?.attemptId, saved.attemptId);
    },
  );
});

Deno.test("POST /lti/launch rejects bad signed launches before any runtime handoff", async () => {
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
        state: "state-invalid-launch",
        nonce: "nonce-invalid-launch",
        expiresAt: "2026-03-25T02:45:00Z",
      }),
    ],
  });
  const formData = new FormData();

  formData.set("state", "state-invalid-launch");
  formData.set(
    "id_token",
    await signCanvasIdToken({
      nonce: "nonce-invalid-launch",
      issuedAt: "2026-03-24T00:45:00Z",
      expirationTime: "2h",
    }),
  );

  await withFetchStub(
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    async () => {
      const response = await createApp({
        getRepository: () => repository,
      }).request("http://localhost/lti/launch", {
        method: "POST",
        body: formData,
      });
      const body = await response.text();

      assertEquals(response.status, 409);
      assertStringIncludes(
        body,
        "Launch id_token signature or issuer validation failed.",
      );
    },
  );
});

Deno.test("GET /runtime/sessions/:id serves the reviewed entrypoint with Lantern bootstrap injected", async () => {
  const response = await createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2026-03-25T02:45:00Z",
          }),
        ],
      }),
  }).request(
    "http://localhost/runtime/sessions/runtime-session-123?token=runtime-token-123",
  );

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "GatewayBootstrap");
  assertStringIncludes(body, "attempt-123");
  assertStringIncludes(body, "runtime-token-123");
  assertStringIncludes(
    body,
    "/runtime/sessions/runtime-session-123/files/dist/?token=runtime-token-123",
  );
});

Deno.test(
  "POST /runtime/sessions/:id/attempt-events enforces session auth, capability checks, and append-only event writes",
  async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          expiresAt: "2026-03-25T02:45:00Z",
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
    });

    const response = await app.request(
      "http://localhost/runtime/sessions/runtime-session-123/attempt-events",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "answer",
          questionId: "q1",
          answer: "asteroid",
          timestamp: "2026-03-24T02:30:00Z",
        }),
      },
    );

    assertEquals(response.status, 202);

    const events = await repository.listAttemptEvents("attempt-123");
    const auditEvents = await repository.listAuditEventsByEventType(
      "attempt.submitted",
    );

    assertEquals(events.length, 1);
    assertEquals(events[0]?.eventType, "answer");
    assertEquals(auditEvents.length, 1);
    assertEquals(auditEvents[0]?.attemptId, "attempt-123");
  },
);

Deno.test(
  "POST /runtime/sessions/:id/finalize finalizes the durable attempt and keeps grade publication inside the gateway boundary",
  async () => {
    const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
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
        buildDeploymentRecord({
          binding: buildDeploymentBinding(),
        }),
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
        buildRuntimeSessionRecord({
          expiresAt: "2026-03-25T02:45:00Z",
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
    });

    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub((input) => {
        const url = String(input);

        if (url === "https://sso.canvaslms.com/login/oauth2/token") {
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

        return new Response(null, { status: 202 });
      }, async () => {
        const firstResponse = await app.request(
          "http://localhost/runtime/sessions/runtime-session-123/finalize",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer runtime-token-123",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              completionState: "completed",
            }),
          },
        );
        const secondResponse = await app.request(
          "http://localhost/runtime/sessions/runtime-session-123/finalize",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer runtime-token-123",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              completionState: "abandoned",
            }),
          },
        );

        assertEquals(firstResponse.status, 202);
        assertEquals(secondResponse.status, 202);

        const firstBody = await firstResponse.json() as {
          accepted: boolean;
          alreadyFinalized: boolean;
          attemptId: string;
          completionState: "completed" | "abandoned" | null;
          scoreGiven: number;
          scoreMaximum: number;
          gradePublished: boolean;
        };
        const secondBody = await secondResponse.json() as typeof firstBody;
        const attempt = await repository.getAttemptById("attempt-123");
        const attemptAuditEvents = await repository.listAuditEventsByEventType(
          "attempt.finalized",
        );
        const gradeAuditEvents = await repository.listAuditEventsByEventType(
          "grade_publish.succeeded",
        );
        const failedGradeAuditEvents = await repository
          .listAuditEventsByEventType(
            "grade_publish.failed",
          );
        const lineItemBinding = await repository.getLineItemBinding({
          deploymentRecordId: 1,
          packageVersionId: 1,
          contextId: "course-42",
          resourceLinkId: "resource-link-123",
          activityId: "activity-123",
        });
        const gradePublication = await repository
          .getGradePublicationByAttemptId(
            "attempt-123",
          );

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
      });
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test(
  "POST /runtime/sessions/:id/finalize records a failed grade publish when Canvas token exchange fails",
  async () => {
    const previousToolKey = Deno.env.get("LTI_TOOL_PRIVATE_JWK");
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
        buildDeploymentRecord({
          binding: buildDeploymentBinding(),
        }),
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
        buildRuntimeSessionRecord({
          expiresAt: "2026-03-25T02:45:00Z",
        }),
      ],
    });

    Deno.env.set("LTI_TOOL_PRIVATE_JWK", getTestToolPrivateJwkEnvValue());

    try {
      await withFetchStub(
        () =>
          new Response(
            JSON.stringify({
              error: "invalid_client",
            }),
            {
              status: 401,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        async () => {
          const response = await createApp({
            getRepository: () => repository,
          }).request(
            "http://localhost/runtime/sessions/runtime-session-123/finalize",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer runtime-token-123",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                completionState: "completed",
              }),
            },
          );

          assertEquals(response.status, 500);

          const attemptAuditEvents = await repository
            .listAuditEventsByEventType(
              "attempt.finalized",
            );
          const failedGradeAuditEvents = await repository
            .listAuditEventsByEventType(
              "grade_publish.failed",
            );
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
    } finally {
      restoreEnv("LTI_TOOL_PRIVATE_JWK", previousToolKey);
    }
  },
);

Deno.test("GET /runtime/sessions/:id/content serves reviewed activity content through the scoped runtime bridge", async () => {
  const response = await createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2026-03-25T02:45:00Z",
          }),
        ],
      }),
  }).request("http://localhost/runtime/sessions/runtime-session-123/content", {
    headers: {
      Authorization: "Bearer runtime-token-123",
    },
  });

  assertEquals(response.status, 200);
  const body = await response.json() as {
    title: string;
    questions: Array<{ id: string }>;
  };

  assertEquals(body.title, "Chapter 4 Asteroids");
  assertEquals(body.questions[0]?.id, "q1");
});

Deno.test("GET /runtime/sessions/:id/files/* serves reviewed asset bytes and blocks bad tokens", async () => {
  const app = createApp({
    getRepository: () =>
      createInMemoryPackageReviewRepository({
        runtimeSessions: [
          buildRuntimeSessionRecord({
            snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
            entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
            contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
            expiresAt: "2026-03-25T02:45:00Z",
          }),
        ],
      }),
  });
  const goodResponse = await app.request(
    "http://localhost/runtime/sessions/runtime-session-123/files/dist/app.js?token=runtime-token-123",
  );
  const deniedResponse = await app.request(
    "http://localhost/runtime/sessions/runtime-session-123/files/dist/app.js?token=wrong-token",
  );

  assertEquals(goodResponse.status, 200);
  assertStringIncludes(await goodResponse.text(), "Attempt finalized");
  assertEquals(deniedResponse.status, 409);
  assertStringIncludes(
    await deniedResponse.text(),
    "Runtime session token did not match the requested session.",
  );
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}

async function withFetchStub<T>(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise.resolve(handler(input, init));

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
