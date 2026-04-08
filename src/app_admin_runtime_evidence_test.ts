import { assertEquals } from "@std/assert";
import { createApp } from "./app.ts";
import {
  buildAttemptEvidenceArtifactRecord,
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import type { EvidenceArtifactStore } from "./runtime/evidence_artifact_store.ts";

Deno.test("GET /admin/packages/:appId/deployment/evidence/:artifactId returns the stored anonymous evidence artifact", async () => {
  const evidenceBytes = new TextEncoder().encode(
    JSON.stringify({
      submissionMode: "anonymous_submission",
      status: "completed",
    }),
  );
  const repository = createInMemoryPackageReviewRepository({
    attempts: [
      buildAttemptRecord({
        appId: "chapter-4-asteroids",
      }),
    ],
    attemptEvidenceArtifacts: [
      buildAttemptEvidenceArtifactRecord({
        artifactId: "artifact-001",
        attemptId: "attempt-123",
        kind: "structured_json",
        contentType: "application/json",
        fileName: "submission.json",
        storageKey:
          "var/attempt-evidence/attempt-123/artifact-001-submission.json",
      }),
    ],
  });
  const evidenceArtifactStore: EvidenceArtifactStore = {
    writeBytes() {
      return Promise.resolve();
    },
    readBytes(storageKey) {
      assertEquals(
        storageKey,
        "var/attempt-evidence/attempt-123/artifact-001-submission.json",
      );
      return Promise.resolve(evidenceBytes.slice());
    },
  };

  const response = await createApp({
    getRepository: () => repository,
    evidenceArtifactStore,
  }).request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/evidence/artifact-001",
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(
    await response.text(),
    new TextDecoder().decode(evidenceBytes),
  );
});
