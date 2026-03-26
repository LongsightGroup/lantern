import { assertEquals } from "@std/assert";
import {
  buildDeepLinkingSessionRecord,
  buildLaunchServiceClaims,
  buildLoginStateRecord,
  buildRuntimeSessionRecord,
} from "../test_helpers/lti.ts";
import { buildAttemptRecord } from "../test_helpers/package_review.ts";
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from "./repository_test_support.ts";
import { resolveCanvasIssuer } from "../lti/config.ts";

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
    assertEquals(fetchedRuntimeSession?.packageVersionId, approvedRecord.id);
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
        lms: "canvas",
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
