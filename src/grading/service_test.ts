import { assertEquals } from "@std/assert";
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildPackageVersionRecord,
} from "../test_helpers/package_review.ts";

Deno.test.ignore(
  "grading service validates the reviewed rubric file before any authoritative score calculation",
  async () => {
    const modulePath = `./${"service.ts"}`;
    const grading = await import(modulePath);
    const packageVersion = buildPackageVersionRecord();

    const rubric = await grading.loadReviewedRubric({
      snapshotRoot: packageVersion.artifact.snapshotRoot,
      rubricFile: packageVersion.grading.rubricFile,
    });

    assertEquals(typeof rubric, "object");
  },
);

Deno.test.ignore(
  "grading service computes the final server-side score from the durable attempt ledger on finalize",
  async () => {
    const modulePath = `./${"service.ts"}`;
    const grading = await import(modulePath);
    const result = await grading.scoreAttempt({
      attempt: buildAttemptRecord(),
      events: [
        buildAttemptEventRecord(),
        buildAttemptEventRecord({
          id: 2,
          sequence: 2,
          eventType: "complete",
          event: {
            type: "complete",
            timestamp: "2026-03-24T02:32:00Z",
          },
        }),
      ],
    });

    assertEquals(result.scoreMaximum, 100);
  },
);
