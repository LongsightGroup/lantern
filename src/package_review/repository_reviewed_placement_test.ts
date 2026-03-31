import { assertEquals, assertRejects } from "@std/assert";
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from "./repository_test_support.ts";

Deno.test("repository stores reviewed placements separately from line-item bindings and binds the first Canvas resource link", async () => {
  await withRepositoryTestDatabase(async ({ pool, repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({ version: "0.2.0" }),
        )
      ).id,
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
        text: "SELECT COUNT(*)::bigint AS count FROM line_item_bindings",
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
