import { assert, assertEquals, assertRejects } from "@std/assert";
import type { Pool } from "@db/postgres";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
  buildDeepLinkingSessionRecord,
  buildLaunchServiceClaims,
  buildLoginStateRecord,
  buildRuntimeSessionRecord,
} from "../test_helpers/lti.ts";
import { runMigrations } from "../db/migrate.ts";
import { createDatabasePool } from "../db/pool.ts";
import { resetPackageReviewTables } from "../test_helpers/postgres.ts";
import { type ImportedPackageVersion } from "./intake.ts";
import { validateManifest } from "./manifest.ts";
import { createPackageReviewRepository } from "./repository.ts";
import {
  buildAttemptRecord,
  buildAuditEventRecord,
  buildCanvasLineItemBindingRecord,
  buildGradePublicationRecord,
} from "../test_helpers/package_review.ts";

const DEMO_SOURCE_ROOT = "examples/apps/chapter-4-asteroids";

async function withRepositoryTestDatabase(
  run: (context: {
    pool: Pool;
    repository: ReturnType<typeof createPackageReviewRepository>;
  }) => Promise<void>,
): Promise<void> {
  const pool = createDatabasePool(1);

  try {
    await runMigrations(pool);
    await resetPackageReviewTables(pool);
    await run({
      pool,
      repository: createPackageReviewRepository(pool),
    });
  } finally {
    await pool.end();
  }
}

async function buildImportedPackageVersion(
  overrides: {
    appId?: string;
    version?: string;
    title?: string;
    snapshotRoot?: string;
  } = {},
): Promise<ImportedPackageVersion> {
  const validation = await validateManifest({ sourceRoot: DEMO_SOURCE_ROOT });

  if (!validation.ok) {
    throw new Error(
      `Expected demo manifest to validate in repository tests: ${
        JSON.stringify(validation.issues)
      }`,
    );
  }

  const appId = overrides.appId ?? validation.reviewData.appId;
  const version = overrides.version ?? validation.reviewData.version;
  const title = overrides.title ?? validation.reviewData.title;
  const snapshotRoot = overrides.snapshotRoot ??
    `var/packages/${appId}/${version}`;

  return {
    reviewData: {
      ...validation.reviewData,
      appId,
      version,
      title,
      manifestJson: {
        ...validation.reviewData.manifestJson,
        app_id: appId,
        version,
        title,
      },
    },
    artifact: {
      snapshotRoot,
      manifestPath: `${snapshotRoot}/manifest.json`,
      entrypointPath: `${snapshotRoot}${validation.reviewData.entrypoint}`,
      digest: `sha256:${appId}-${version.replaceAll(".", "-")}`,
    },
  };
}

Deno.test("repository rejects duplicate app versions and returns semver-sorted history", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const version010 = await buildImportedPackageVersion();
    const version020 = await buildImportedPackageVersion({
      version: "0.2.0",
    });
    const version0100 = await buildImportedPackageVersion({
      version: "0.10.0",
    });

    const firstRecord = await repository.registerPackageVersion(version010);
    await repository.registerPackageVersion(version020);
    await repository.registerPackageVersion(version0100);

    await assertRejects(
      () => repository.registerPackageVersion(version010),
      Error,
      "Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.",
    );

    const detail = await repository.getPackageVersionByAppVersion(
      "chapter-4-asteroids",
      "0.10.0",
    );
    const history = await repository.listPackageVersionsByApp(
      "chapter-4-asteroids",
    );

    assert(detail);
    assertEquals(firstRecord.approvalStatus, "pending");
    assertEquals(detail?.version, "0.10.0");
    assertEquals(
      history.map((record: { version: string }) => record.version),
      ["0.10.0", "0.2.0", "0.1.0"],
    );
  });
});

Deno.test("repository records one-way approval and rejection decisions with optional notes", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvalCandidate = await repository.registerPackageVersion(
      await buildImportedPackageVersion(),
    );
    const rejectionCandidate = await repository.registerPackageVersion(
      await buildImportedPackageVersion({
        version: "0.2.0",
      }),
    );

    const approved = await repository.approvePackageVersion({
      id: approvalCandidate.id,
      reviewNotes: "Ready for the pilot deployment.",
    });
    const rejected = await repository.rejectPackageVersion({
      id: rejectionCandidate.id,
      reviewNotes: null,
    });

    assertEquals(approved.approvalStatus, "approved");
    assertEquals(approved.reviewNotes, "Ready for the pilot deployment.");
    assert(approved.reviewedAt !== null);
    assertEquals(rejected.approvalStatus, "rejected");
    assertEquals(rejected.reviewNotes, null);
    assert(rejected.reviewedAt !== null);

    await assertRejects(
      () =>
        repository.rejectPackageVersion({
          id: approvalCandidate.id,
          reviewNotes: "Trying to reverse an approval.",
        }),
      Error,
      "Package version chapter-4-asteroids@0.1.0 has already been reviewed and cannot change state.",
    );
    await assertRejects(
      () =>
        repository.approvePackageVersion({
          id: rejectionCandidate.id,
          reviewNotes: "Trying to reverse a rejection.",
        }),
      Error,
      "Package version chapter-4-asteroids@0.2.0 has already been reviewed and cannot change state.",
    );
  });
});

Deno.test("repository pins exact approved versions and preserves the existing deployment on rejected updates", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for the first pilot.",
    });
    const pendingRecord = await repository.registerPackageVersion(
      await buildImportedPackageVersion({
        version: "0.2.0",
      }),
    );
    const otherAppRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion({
          appId: "algebra-helper",
          version: "1.0.0",
          title: "Algebra Helper",
          snapshotRoot: "var/packages/algebra-helper/1.0.0",
        }),
      )).id,
      reviewNotes: "Approved for a different app.",
    });

    const deployment = await repository.pinDeploymentVersion({
      slug: "demo-course",
      label: "Demo Course",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });

    assertEquals(deployment.enabledPackageVersionId, approvedRecord.id);
    assertEquals(deployment.enabledPackageVersion, "0.1.0");

    await assertRejects(
      () =>
        repository.pinDeploymentVersion({
          slug: "demo-course",
          label: "Demo Course",
          appId: "chapter-4-asteroids",
          packageVersionId: pendingRecord.id,
        }),
      Error,
      "Only approved package versions can be enabled.",
    );
    await assertRejects(
      () =>
        repository.pinDeploymentVersion({
          slug: "demo-course",
          label: "Demo Course",
          appId: "chapter-4-asteroids",
          packageVersionId: otherAppRecord.id,
        }),
      Error,
      "Package version algebra-helper@1.0.0 does not belong to deployment app chapter-4-asteroids.",
    );

    const persistedDeployment = await repository.getDeploymentBySlug(
      "demo-course",
    );

    assert(persistedDeployment);
    assertEquals(
      persistedDeployment?.enabledPackageVersionId,
      approvedRecord.id,
    );
    assertEquals(persistedDeployment?.enabledPackageVersion, "0.1.0");
  });
});

Deno.test("repository saves one exact Canvas binding per deployment and rejects duplicate bindings", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const saved = await repository.saveDeploymentBinding({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      binding: {
        canvasEnvironment: "production",
        issuer: resolveCanvasIssuer("production"),
        clientId: "10000000000001",
        deploymentId: "deployment-123",
      },
    });

    assert(saved.binding !== null);
    assertEquals(saved.binding?.canvasEnvironment, "production");
    assertEquals(saved.binding?.clientId, "10000000000001");
    assertEquals(saved.binding?.deploymentId, "deployment-123");

    const fetched = await repository.getDeploymentByBinding({
      issuer: resolveCanvasIssuer("production"),
      clientId: "10000000000001",
      deploymentId: "deployment-123",
    });

    assert(fetched);
    assertEquals(fetched?.slug, "chapter-4-asteroids-pilot");

    await repository.saveDeploymentBinding({
      slug: "second-app-pilot",
      label: "Second App Pilot Deployment",
      appId: "second-app",
      binding: {
        canvasEnvironment: "beta",
        issuer: resolveCanvasIssuer("beta"),
        clientId: "10000000000002",
        deploymentId: "deployment-456",
      },
    });

    await assertRejects(
      () =>
        repository.saveDeploymentBinding({
          slug: "duplicate-binding",
          label: "Duplicate Binding",
          appId: "duplicate-app",
          binding: {
            canvasEnvironment: "production",
            issuer: resolveCanvasIssuer("production"),
            clientId: "10000000000001",
            deploymentId: "deployment-123",
          },
        }),
      Error,
      "Canvas binding 10000000000001 / deployment-123 already belongs to another deployment.",
    );
  });
});

Deno.test("repository persists one-time login state records and runtime sessions", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for the pilot launch.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const loginState = buildLoginStateRecord();
    const savedLoginState = await repository.createLoginState(loginState);
    const consumedLoginState = await repository.consumeLoginState({
      state: loginState.state,
      usedAt: "2026-03-23T22:46:00Z",
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );
    const runtimeSession = buildRuntimeSessionRecord({
      attemptId: attempt.attemptId,
      deploymentRecordId: deployment.id,
      deploymentSlug: deployment.slug,
      packageVersionId: approvedRecord.id,
      packageVersion: approvedRecord.version,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      services: buildLaunchServiceClaims(),
    });
    const savedRuntimeSession = await repository.createRuntimeSession(
      runtimeSession,
    );
    const fetchedRuntimeSession = await repository.getRuntimeSessionById(
      runtimeSession.sessionId,
    );

    assertEquals(savedLoginState.state, loginState.state);
    assertEquals(consumedLoginState.usedAt, "2026-03-23T22:46:00.000Z");
    assertEquals(savedRuntimeSession.sessionId, runtimeSession.sessionId);
    assertEquals(savedRuntimeSession.attemptId, runtimeSession.attemptId);
    assertEquals(
      savedRuntimeSession.services.ags?.lineitemsUrl,
      runtimeSession.services.ags?.lineitemsUrl,
    );
    assertEquals(
      fetchedRuntimeSession?.packageVersionId,
      approvedRecord.id,
    );
    assertEquals(
      fetchedRuntimeSession?.services.nrps?.contextMembershipsUrl,
      runtimeSession.services.nrps?.contextMembershipsUrl,
    );
  });
});

Deno.test("repository lists approved assignment deep-linking resources and stores explicit session selection", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const assignmentV010 = await buildImportedPackageVersion();
    assignmentV010.reviewData.installScope = "assignment";
    assignmentV010.reviewData.manifestJson = {
      ...assignmentV010.reviewData.manifestJson,
      install_scope: "assignment",
      content_files: ["/content/activity.json"],
    };

    const assignmentV020 = await buildImportedPackageVersion({
      version: "0.2.0",
    });
    assignmentV020.reviewData.installScope = "assignment";
    assignmentV020.reviewData.manifestJson = {
      ...assignmentV020.reviewData.manifestJson,
      install_scope: "assignment",
      content_files: ["/content/activity.json", "content/bonus.json"],
    };

    const courseScoped = await buildImportedPackageVersion({
      version: "0.3.0",
    });
    courseScoped.reviewData.installScope = "course";

    const approvedAssignment010 = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(assignmentV010)).id,
      reviewNotes: "Approved assignment version.",
    });
    const approvedAssignment020 = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(assignmentV020)).id,
      reviewNotes: "Approved later assignment version.",
    });
    await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(courseScoped)).id,
      reviewNotes: "Approved course version only.",
    });
    const deployment = await repository.saveDeploymentBinding({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      binding: {
        canvasEnvironment: "production",
        issuer: resolveCanvasIssuer("production"),
        clientId: "10000000000001",
        deploymentId: "deployment-123",
      },
    });
    const session = await repository.createDeepLinkingSession(
      buildDeepLinkingSessionRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        appId: deployment.appId,
      }),
    );
    const resources = await repository.listDeepLinkingResourceOptions(
      "chapter-4-asteroids",
    );
    const updatedSession = await repository.updateDeepLinkingSessionSelection({
      sessionId: session.sessionId,
      selection: {
        packageVersionId: approvedAssignment020.id,
        packageVersion: approvedAssignment020.version,
        activityId: "/content/bonus.json",
        contentPath: "/content/bonus.json",
      },
    });

    assertEquals(
      resources.map((resource) =>
        `${resource.packageVersion}:${resource.contentPath}`
      ),
      [
        "0.2.0:/content/activity.json",
        "0.2.0:/content/bonus.json",
        "0.1.0:/content/activity.json",
      ],
    );
    assertEquals(resources[0]?.installScope, "assignment");
    assertEquals(resources[0]?.approvalStatus, "approved");
    assertEquals(resources[2]?.packageVersionId, approvedAssignment010.id);
    assertEquals(
      updatedSession.selection?.packageVersionId,
      approvedAssignment020.id,
    );
    assertEquals(updatedSession.selection?.contentPath, "/content/bonus.json");
  });
});

Deno.test("repository creates durable attempts that stay distinct from runtime sessions", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for durable launch tracking.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );
    const runtimeSession = await repository.createRuntimeSession(
      buildRuntimeSessionRecord({
        attemptId: attempt.attemptId,
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
        snapshotRoot: approvedRecord.artifact.snapshotRoot,
        entrypointPath: approvedRecord.artifact.entrypointPath,
      }),
    );
    const fetchedAttempt = await repository.getAttemptById(attempt.attemptId);

    assertEquals(fetchedAttempt?.attemptId, attempt.attemptId);
    assertEquals(fetchedAttempt?.status, "in_progress");
    assertEquals(runtimeSession.attemptId, attempt.attemptId);
    assertEquals(runtimeSession.sessionId === attempt.attemptId, false);
  });
});

Deno.test("repository records append-only audit events in order and resetPackageReviewTables clears phase 3 rows", async () => {
  await withRepositoryTestDatabase(async ({ pool, repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for audit trail tests.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );

    await repository.recordAuditEvent(
      buildAuditEventRecord({
        eventType: "launch.accepted",
        summary: "Accepted the governed launch.",
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
        attemptId: attempt.attemptId,
      }),
    );
    await repository.recordAuditEvent(
      buildAuditEventRecord({
        id: 2,
        eventType: "attempt.submitted",
        summary: "Accepted the attempt submission.",
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
        attemptId: attempt.attemptId,
        occurredAt: "2026-03-24T02:31:00Z",
      }),
    );

    const history = await repository.listAuditEventsByAttemptId(
      attempt.attemptId,
    );

    assertEquals(history.map((event) => event.eventType), [
      "launch.accepted",
      "attempt.submitted",
    ]);
    assertEquals(history[0]?.summary, "Accepted the governed launch.");

    await resetPackageReviewTables(pool);

    assertEquals(await repository.getAttemptById(attempt.attemptId), null);
    assertEquals(
      await repository.listAuditEventsByAttemptId(attempt.attemptId),
      [],
    );
  });
});

Deno.test("repository appends attempt events in sequence order for a durable attempt", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for attempt event tests.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );

    await repository.appendAttemptEvent({
      attemptId: attempt.attemptId,
      event: {
        type: "answer",
        questionId: "q1",
        answer: "asteroid",
        timestamp: "2026-03-24T02:30:00Z",
      },
      receivedAt: "2026-03-24T02:30:01Z",
    });
    await repository.appendAttemptEvent({
      attemptId: attempt.attemptId,
      event: {
        type: "complete",
        timestamp: "2026-03-24T02:31:00Z",
      },
      receivedAt: "2026-03-24T02:31:01Z",
    });

    const events = await repository.listAttemptEvents(attempt.attemptId);

    assertEquals(events.map((event) => event.sequence), [1, 2]);
    assertEquals(events.map((event) => event.eventType), [
      "answer",
      "complete",
    ]);
  });
});

Deno.test("repository finalizes durable attempts idempotently", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for attempt finalize tests.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );

    const firstFinalize = await repository.finalizeAttempt({
      attemptId: attempt.attemptId,
      status: "completed",
      completionState: "completed",
      finalizedAt: "2026-03-24T02:35:00Z",
    });
    const secondFinalize = await repository.finalizeAttempt({
      attemptId: attempt.attemptId,
      status: "abandoned",
      completionState: "abandoned",
      finalizedAt: "2026-03-24T02:40:00Z",
    });

    assertEquals(firstFinalize.status, "completed");
    assertEquals(firstFinalize.completionState, "completed");
    assertEquals(firstFinalize.finalizedAt, "2026-03-24T02:35:00.000Z");
    assertEquals(secondFinalize.status, "completed");
    assertEquals(secondFinalize.completionState, "completed");
    assertEquals(secondFinalize.finalizedAt, "2026-03-24T02:35:00.000Z");
  });
});

Deno.test("repository stores package-version line item bindings and idempotent grade publications", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for AGS publication tests.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const attempt = await repository.createAttempt(
      buildAttemptRecord({
        deploymentRecordId: deployment.id,
        deploymentSlug: deployment.slug,
        packageVersionId: approvedRecord.id,
        packageVersion: approvedRecord.version,
      }),
    );
    const savedBinding = await repository.saveLineItemBinding(
      buildCanvasLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
      }),
    );
    const reusedBinding = await repository.saveLineItemBinding(
      buildCanvasLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: approvedRecord.id,
      }),
    );
    const createdPublication = await repository.createGradePublication(
      buildGradePublicationRecord({
        attemptId: attempt.attemptId,
        lineItemBindingId: savedBinding.id,
        createdAt: "2026-03-24T02:35:00Z",
        updatedAt: "2026-03-24T02:35:00Z",
        publishedAt: null,
        status: "pending",
        gradingProgress: "Pending",
      }),
    );
    const reusedPublication = await repository.createGradePublication(
      buildGradePublicationRecord({
        attemptId: attempt.attemptId,
        lineItemBindingId: savedBinding.id,
        createdAt: "2026-03-24T02:35:00Z",
        updatedAt: "2026-03-24T02:35:00Z",
        publishedAt: null,
        status: "pending",
        gradingProgress: "Pending",
      }),
    );
    const published = await repository.updateGradePublication({
      attemptId: attempt.attemptId,
      status: "published",
      updatedAt: "2026-03-24T02:36:00Z",
      publishedAt: "2026-03-24T02:36:00Z",
      errorCode: null,
      errorDetail: null,
    });
    const fetchedBinding = await repository.getLineItemBinding({
      deploymentRecordId: deployment.id,
      packageVersionId: approvedRecord.id,
      contextId: attempt.contextId,
      resourceLinkId: attempt.resourceLinkId,
      activityId: attempt.activityId,
    });
    const fetchedPublication = await repository.getGradePublicationByAttemptId(
      attempt.attemptId,
    );

    assertEquals(savedBinding.id, reusedBinding.id);
    assertEquals(createdPublication.id, reusedPublication.id);
    assertEquals(published.status, "published");
    assertEquals(published.publishedAt, "2026-03-24T02:36:00.000Z");
    assertEquals(fetchedBinding?.lineItemUrl, savedBinding.lineItemUrl);
    assertEquals(fetchedPublication?.status, "published");
  });
});

Deno.test("repository stores reviewed placements separately from line-item bindings and binds the first Canvas resource link", async () => {
  await withRepositoryTestDatabase(async ({ pool, repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion({
          version: "0.2.0",
        }),
      )).id,
      reviewNotes: "Approved for reviewed placement creation.",
    });
    const deployment = await repository.pinDeploymentVersion({
      slug: "chapter-4-asteroids-pilot",
      label: "Chapter 4 Asteroids Pilot Deployment",
      appId: "chapter-4-asteroids",
      packageVersionId: approvedRecord.id,
    });
    const created = await repository.createReviewedPlacement({
      placementId: "placement-123",
      deploymentRecordId: deployment.id,
      deploymentSlug: deployment.slug,
      appId: deployment.appId,
      contextId: "course-42",
      contextTitle: "Physics 101",
      packageVersionId: approvedRecord.id,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      activityId: "/content/bonus.json",
      contentPath: "/content/bonus.json",
      contentTitle: "Bonus Activity",
      createdByUserId: "canvas-user-123",
      resourceLinkId: null,
      createdAt: "2026-03-24T18:00:00Z",
      boundAt: null,
    });
    const fetched = await repository.getReviewedPlacementById("placement-123");
    const bound = await repository.bindReviewedPlacementResourceLink({
      placementId: "placement-123",
      resourceLinkId: "resource-link-999",
      boundAt: "2026-03-24T18:01:00Z",
    });
    const rebound = await repository.bindReviewedPlacementResourceLink({
      placementId: "placement-123",
      resourceLinkId: "resource-link-999",
      boundAt: "2026-03-24T18:02:00Z",
    });
    const client = await pool.connect();
    let bindingCounts: bigint;

    try {
      const result = await client.queryObject<{ count: bigint }>({
        text: "SELECT COUNT(*)::bigint AS count FROM canvas_line_item_bindings",
        camelCase: true,
      });

      bindingCounts = result.rows[0]?.count ?? 0n;
    } finally {
      client.release();
    }

    assertEquals(created.resourceLinkId, null);
    assertEquals(fetched?.packageVersionId, approvedRecord.id);
    assertEquals(fetched?.packageTitle, approvedRecord.title);
    assertEquals(fetched?.contentTitle, "Bonus Activity");
    assertEquals(bound.resourceLinkId, "resource-link-999");
    assertEquals(bound.boundAt, "2026-03-24T18:01:00.000Z");
    assertEquals(rebound.resourceLinkId, "resource-link-999");
    assertEquals(rebound.boundAt, "2026-03-24T18:01:00.000Z");
    assertEquals(bindingCounts, 0n);

    await assertRejects(
      () =>
        repository.bindReviewedPlacementResourceLink({
          placementId: "placement-123",
          resourceLinkId: "resource-link-other",
          boundAt: "2026-03-24T18:03:00Z",
        }),
      Error,
      "Reviewed placement placement-123 is already bound to Canvas resource link resource-link-999.",
    );
  });
});

Deno.test("repository creates and reads preview sessions without Canvas deployment state", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion({
          version: "0.3.0",
        }),
      )).id,
      reviewNotes: "Approved for governed preview sessions.",
    });

    const created = await repository.createPreviewSession({
      sessionId: "preview-session-123",
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: "preview-user-123",
        userRole: "instructor",
        courseId: "preview-course-42",
        assignmentId: "preview-assignment-7",
        activityId: "preview-activity-9",
      },
      fakeAttemptId: "preview-attempt-123",
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: "instructor",
          course_id: "preview-course-42",
          assignment_id: "preview-assignment-7",
          activity_id: "preview-activity-9",
        },
        attempt_id: "preview-attempt-123",
        local_state: null,
      },
      createdAt: "2026-03-25T01:00:00Z",
    });
    const fetched = await repository.getPreviewSessionById(
      "preview-session-123",
    );

    assertEquals(created.sessionId, "preview-session-123");
    assertEquals(created.packageVersionId, approvedRecord.id);
    assertEquals(created.packageVersion, approvedRecord.version);
    assertEquals(created.launch.courseId, "preview-course-42");
    assertEquals(fetched?.sessionId, "preview-session-123");
    assertEquals(fetched?.launch.userRole, "instructor");
    assertEquals(fetched?.fakeAttemptId, "preview-attempt-123");
  });
});

Deno.test("repository appends preview evidence rows in chronological append order", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion({
          version: "0.4.0",
        }),
      )).id,
      reviewNotes: "Approved for preview evidence ordering.",
    });
    const session = await repository.createPreviewSession({
      sessionId: "preview-session-evidence",
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: "preview-user-123",
        userRole: "learner",
        courseId: "preview-course-42",
        assignmentId: null,
        activityId: "preview-activity-9",
      },
      fakeAttemptId: "preview-attempt-evidence",
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: "learner",
          course_id: "preview-course-42",
          assignment_id: null,
          activity_id: "preview-activity-9",
        },
        attempt_id: "preview-attempt-evidence",
        local_state: null,
      },
      createdAt: "2026-03-25T01:05:00Z",
    });

    await repository.appendPreviewEvidence({
      previewSessionId: session.sessionId,
      eventType: "preview.launch",
      capability: null,
      summary: "Preview session launched in governed sandbox.",
      detail: {
        route: "/admin/packages/chapter-4-asteroids/versions/0.4.0/preview",
      },
      occurredAt: "2026-03-25T01:05:10Z",
    });
    await repository.appendPreviewEvidence({
      previewSessionId: session.sessionId,
      eventType: "preview.finalize",
      capability: "finalize_attempt",
      summary: "Preview finalize produced fake scoring output.",
      detail: {
        scoreGiven: 97,
        scoreMaximum: 100,
      },
      occurredAt: "2026-03-25T01:06:00Z",
    });

    const evidence = await repository.listPreviewEvidence(session.sessionId);

    assertEquals(evidence.map((row) => row.sequence), [1, 2]);
    assertEquals(evidence.map((row) => row.eventType), [
      "preview.launch",
      "preview.finalize",
    ]);
    assertEquals(evidence[1]?.capability, "finalize_attempt");
  });
});

Deno.test("repository returns the latest preview session by package version for capability log lookup", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion({
          version: "0.5.0",
        }),
      )).id,
      reviewNotes: "Approved for preview capability-log lookup.",
    });

    await repository.createPreviewSession({
      sessionId: "preview-session-oldest",
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: "preview-user-old",
        userRole: "learner",
        courseId: "preview-course-42",
        assignmentId: null,
        activityId: "preview-activity-9",
      },
      fakeAttemptId: "preview-attempt-old",
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: "learner",
          course_id: "preview-course-42",
          assignment_id: null,
          activity_id: "preview-activity-9",
        },
        attempt_id: "preview-attempt-old",
        local_state: null,
      },
      createdAt: "2026-03-25T01:00:00Z",
    });

    const latestCreated = await repository.createPreviewSession({
      sessionId: "preview-session-latest",
      packageVersionId: approvedRecord.id,
      appId: approvedRecord.appId,
      packageVersion: approvedRecord.version,
      packageTitle: approvedRecord.title,
      capabilities: approvedRecord.capabilities,
      snapshotRoot: approvedRecord.artifact.snapshotRoot,
      entrypointPath: approvedRecord.artifact.entrypointPath,
      launch: {
        userId: "preview-user-new",
        userRole: "instructor",
        courseId: "preview-course-42",
        assignmentId: null,
        activityId: "preview-activity-9",
      },
      fakeAttemptId: "preview-attempt-new",
      fakeScoreMaximum: 100,
      fixtureData: {
        launch: {
          user_role: "instructor",
          course_id: "preview-course-42",
          assignment_id: null,
          activity_id: "preview-activity-9",
        },
        attempt_id: "preview-attempt-new",
        local_state: null,
      },
      createdAt: "2026-03-25T01:01:00Z",
    });

    const latest = await repository.getLatestPreviewSessionByPackageVersion(
      approvedRecord.id,
    );

    assertEquals(latest?.sessionId, latestCreated.sessionId);
    assertEquals(latest?.launch.userRole, "instructor");
  });
});

Deno.test("repository rejects preview writes that reference missing sessions or package versions", async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    await assertRejects(
      () =>
        repository.createPreviewSession({
          sessionId: "preview-session-missing-package",
          packageVersionId: 999_999,
          appId: "chapter-4-asteroids",
          packageVersion: "0.9.9",
          packageTitle: "Missing package version",
          capabilities: [],
          snapshotRoot: "var/packages/chapter-4-asteroids/0.9.9",
          entrypointPath:
            "var/packages/chapter-4-asteroids/0.9.9/dist/index.html",
          launch: {
            userId: "preview-user-123",
            userRole: "learner",
            courseId: "preview-course-42",
            assignmentId: null,
            activityId: "preview-activity-9",
          },
          fakeAttemptId: "preview-attempt-missing",
          fakeScoreMaximum: 100,
          fixtureData: {
            launch: {
              user_role: "learner",
              course_id: "preview-course-42",
              assignment_id: null,
              activity_id: "preview-activity-9",
            },
            attempt_id: "preview-attempt-missing",
            local_state: null,
          },
          createdAt: "2026-03-25T01:07:00Z",
        }),
      Error,
      "Package version id 999999 was not found.",
    );

    await assertRejects(
      () =>
        repository.appendPreviewEvidence({
          previewSessionId: "preview-session-missing",
          eventType: "preview.launch",
          capability: null,
          summary: "Should fail because session does not exist.",
          detail: {
            code: "missing_preview_session",
          },
          occurredAt: "2026-03-25T01:07:30Z",
        }),
      Error,
      "Preview session preview-session-missing was not found.",
    );
  });
});
