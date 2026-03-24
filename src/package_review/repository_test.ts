import { assert, assertEquals, assertRejects } from "@std/assert";
import type { Pool } from "@db/postgres";
import { resolveCanvasIssuer } from "../lti/config.ts";
import {
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
