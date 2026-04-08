import { assertEquals } from "@std/assert";
import { RuntimeBrokerDenialError } from "./gateway_errors.ts";
import { submitEvidenceArtifact } from "./gateway.ts";
import { buildRuntimeSessionRecord } from "../test_helpers/lti.ts";
import {
  buildAttemptRecord,
  buildPreviewSessionRecord,
  createInMemoryPackageReviewRepository,
} from "../test_helpers/package_review.ts";
import type { EvidenceArtifactStore } from "./evidence_artifact_store.ts";

Deno.test("runtime gateway accepts an allowlisted evidence artifact and records preview evidence", async () => {
  const bytesByStorageKey = new Map<string, Uint8Array>();
  const repository = createInMemoryPackageReviewRepository({
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: "preview-session-evidence",
        fakeAttemptId: "attempt-123",
        capabilities: [
          "read_launch_context",
          "read_activity_content",
          "submit_attempt_event",
          "submit_evidence_artifact",
          "finalize_attempt",
        ],
      }),
    ],
    attempts: [buildAttemptRecord()],
  });
  const session = buildRuntimeSessionRecord({
    capabilities: [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "submit_evidence_artifact",
      "finalize_attempt",
    ],
    services: {
      ags: null,
      nrps: null,
    },
    preview: {
      previewSessionId: "preview-session-evidence",
    },
  });
  const evidenceArtifactStore: EvidenceArtifactStore = {
    writeBytes(storageKey, bytes) {
      bytesByStorageKey.set(storageKey, bytes.slice());
      return Promise.resolve();
    },
    readBytes(storageKey) {
      const bytes = bytesByStorageKey.get(storageKey);

      if (!bytes) {
        throw new Error(`Evidence artifact ${storageKey} was not found.`);
      }

      return Promise.resolve(bytes.slice());
    },
  };

  const result = await submitEvidenceArtifact({
    repository,
    session,
    payload: {
      kind: "structured_json",
      contentType: "application/json",
      fileName: "submission.json",
      bodyBase64: btoa(JSON.stringify({ score: 100 })),
    },
    evidenceArtifactStore,
    now: () => new Date("2026-04-08T18:50:00Z"),
    createArtifactToken: () => "001",
  });
  const artifacts = await repository.listAttemptEvidenceArtifacts(
    "attempt-123",
  );
  const previewEvidence = await repository.listPreviewEvidence(
    "preview-session-evidence",
  );
  const auditEvents = await repository.listAuditEventsByEventType(
    "attempt.evidence_artifact.submitted",
  );
  const storedBytes = await evidenceArtifactStore.readBytes(
    "var/attempt-evidence/attempt-123/artifact-001-submission.json",
  );

  assertEquals(result, {
    accepted: true,
    artifactId: "artifact-001",
  });
  assertEquals(artifacts.length, 1);
  assertEquals(artifacts[0]?.artifactId, "artifact-001");
  assertEquals(artifacts[0]?.kind, "structured_json");
  assertEquals(
    artifacts[0]?.storageKey,
    "var/attempt-evidence/attempt-123/artifact-001-submission.json",
  );
  assertEquals(new TextDecoder().decode(storedBytes), '{"score":100}');
  assertEquals(previewEvidence.length, 1);
  assertEquals(previewEvidence[0]?.eventType, "preview.evidence_artifact");
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.detail.artifactId, "artifact-001");
});

Deno.test("runtime gateway rejects unsupported evidence kind and content-type pairs", async () => {
  const repository = createInMemoryPackageReviewRepository({
    attempts: [buildAttemptRecord()],
  });
  const session = buildRuntimeSessionRecord({
    capabilities: [
      "read_launch_context",
      "submit_evidence_artifact",
      "finalize_attempt",
    ],
  });

  try {
    await submitEvidenceArtifact({
      repository,
      session,
      payload: {
        kind: "structured_json",
        contentType: "image/png",
        fileName: "submission.json",
        bodyBase64: btoa("invalid"),
      },
      evidenceArtifactStore: {
        writeBytes() {
          return Promise.resolve();
        },
        readBytes() {
          return Promise.resolve(new Uint8Array());
        },
      },
    });
    throw new Error("Expected evidence upload to be rejected.");
  } catch (error) {
    if (!(error instanceof RuntimeBrokerDenialError)) {
      throw error;
    }

    assertEquals(error.category, "specInvalid");
    assertEquals(error.code, "invalid_evidence_artifact");
    assertEquals(error.capability, "submit_evidence_artifact");
    assertEquals(
      await repository.listAttemptEvidenceArtifacts("attempt-123"),
      [],
    );
  }
});
