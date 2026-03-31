import { assertEquals, assertRejects } from "@std/assert";
import {
  bootstrapPackageReviewSchema,
  resetPackageReviewTables,
  withPackageReviewTestDatabase,
} from "../test_helpers/postgres.ts";
import { createOpsRepositoryForTest } from "./repository_test_core_support.ts";
import { seedPlacementAuditSnapshotFixtures } from "./repository_test_placement_seed.ts";

Deno.test("ops repository resolves placement audit snapshots through the shared placement read model", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    await seedPlacementAuditSnapshotFixtures(pool);

    const repository = await createOpsRepositoryForTest(pool);
    const snapshot = await repository.getPlacementAuditSnapshot(
      "placement-ops-123",
    );

    assertEquals(snapshot.placement.placementId, "placement-ops-123");
    assertEquals(snapshot.placement.contextId, "course-42");
    assertEquals(snapshot.placement.packageVersion, "0.8.0");
    assertEquals(snapshot.status, "reviewed");
    assertEquals(snapshot.previewEvidenceCount, 1);
    assertEquals(snapshot.evidenceSummary.reviewerEventCount, 1);
  });
});

Deno.test("ops repository placement audit snapshot fails clearly for unknown placement ids", async () => {
  await withPackageReviewTestDatabase(async (pool) => {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    const repository = await createOpsRepositoryForTest(pool);

    await assertRejects(
      () => repository.getPlacementAuditSnapshot("placement-missing"),
      Error,
      "Reviewed placement placement-missing was not found.",
    );
  });
});
