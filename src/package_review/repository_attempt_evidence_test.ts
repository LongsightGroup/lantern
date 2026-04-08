import { assertEquals } from "@std/assert";
import { resetPackageReviewTables } from "../test_helpers/postgres.ts";
import {
  buildAccessibilityReview,
  buildAttemptEvidenceArtifactRecord,
  buildAttemptRecord,
} from "../test_helpers/package_review.ts";
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from "./repository_test_support.ts";

Deno.test("repository stores attempt evidence artifacts in sequence order and resetPackageReviewTables clears them", async () => {
  await withRepositoryTestDatabase(async ({ pool, repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(
        await buildImportedPackageVersion(),
      )).id,
      reviewNotes: "Approved for anonymous evidence tests.",
      accessibilityReview: buildAccessibilityReview(),
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

    const firstArtifact = buildAttemptEvidenceArtifactRecord({
      artifactId: "artifact-001",
      attemptId: attempt.attemptId,
      kind: "structured_json",
      contentType: "application/json",
      fileName: "submission.json",
      storageKey:
        "var/attempt-evidence/attempt-123/artifact-001-submission.json",
      byteSize: 128,
      sha256: "sha256:artifact-001",
      createdAt: "2026-04-08T14:00:00Z",
    });
    const secondArtifact = buildAttemptEvidenceArtifactRecord({
      artifactId: "artifact-002",
      attemptId: attempt.attemptId,
      kind: "screenshot_png",
      contentType: "image/png",
      fileName: "submission.png",
      storageKey:
        "var/attempt-evidence/attempt-123/artifact-002-submission.png",
      byteSize: 2048,
      sha256: "sha256:artifact-002",
      createdAt: "2026-04-08T14:01:00Z",
    });
    const { sequence: _firstSequence, ...firstInput } = firstArtifact;
    const { sequence: _secondSequence, ...secondInput } = secondArtifact;

    const createdFirst = await repository.createAttemptEvidenceArtifact(
      firstInput,
    );
    const createdSecond = await repository.createAttemptEvidenceArtifact(
      secondInput,
    );
    const loaded = await repository.getAttemptEvidenceArtifactById(
      "artifact-002",
    );
    const listed = await repository.listAttemptEvidenceArtifacts(
      attempt.attemptId,
    );

    assertEquals(createdFirst.sequence, 1);
    assertEquals(createdSecond.sequence, 2);
    assertEquals(loaded?.artifactId, "artifact-002");
    assertEquals(loaded?.kind, "screenshot_png");
    assertEquals(
      listed.map((artifact) => artifact.artifactId),
      ["artifact-001", "artifact-002"],
    );
    assertEquals(
      listed.map((artifact) => artifact.sequence),
      [1, 2],
    );

    await resetPackageReviewTables(pool);

    assertEquals(
      await repository.listAttemptEvidenceArtifacts(attempt.attemptId),
      [],
    );
  });
});
