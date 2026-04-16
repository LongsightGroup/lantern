import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { withRuntimeOriginEnv } from "./app_test_support.ts";
import {
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import { buildRuntimeSessionRecord } from "./test_helpers/lti.ts";
import type { EvidenceArtifactStore } from "./runtime/evidence_artifact_store.ts";

Deno.test("POST /runtime/sessions/:id/evidence-artifacts accepts an allowlisted upload and persists it through Lantern-owned storage", async () => {
  await withRuntimeOriginEnv(async () => {
    const bytesByStorageKey = new Map<string, Uint8Array>();
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          capabilities: [
            "read_launch_context",
            "submit_evidence_artifact",
            "finalize_attempt",
          ],
          expiresAt: "2030-03-26T02:45:00Z",
        }),
      ],
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
    const app = createApp({
      getRepository: () => repository,
      evidenceArtifactStore,
    });

    const response = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/evidence-artifacts",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "structured_json",
          contentType: "application/json",
          fileName: "submission.json",
          bodyBase64: btoa(JSON.stringify({ score: 100 })),
        }),
      },
    );
    const body = (await response.json()) as {
      accepted: boolean;
      artifactId: string;
    };
    const artifacts = await repository.listAttemptEvidenceArtifacts(
      "attempt-123",
    );

    assertEquals(response.status, 202);
    assertEquals(body.accepted, true);
    assertStringIncludes(body.artifactId, "artifact-");
    assertEquals(artifacts.length, 1);
    assertEquals(artifacts[0]?.kind, "structured_json");
    assertEquals(
      new TextDecoder().decode(
        await evidenceArtifactStore.readBytes(artifacts[0]!.storageKey),
      ),
      '{"score":100}',
    );
  });
});

Deno.test("POST /runtime/sessions/:id/evidence-artifacts accepts screenshot_png through the same Lantern-owned storage path", async () => {
  await withRuntimeOriginEnv(async () => {
    const pngBytes = Uint8Array.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);
    const bytesByStorageKey = new Map<string, Uint8Array>();
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          capabilities: [
            "read_launch_context",
            "submit_evidence_artifact",
            "finalize_attempt",
          ],
          expiresAt: "2030-03-26T02:45:00Z",
        }),
      ],
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
    const app = createApp({
      getRepository: () => repository,
      evidenceArtifactStore,
    });

    const response = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/evidence-artifacts",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "screenshot_png",
          contentType: "image/png",
          fileName: "submission.png",
          bodyBase64: btoa(String.fromCharCode(...pngBytes)),
        }),
      },
    );
    const body = (await response.json()) as {
      accepted: boolean;
      artifactId: string;
    };
    const artifacts = await repository.listAttemptEvidenceArtifacts(
      "attempt-123",
    );

    assertEquals(response.status, 202);
    assertEquals(body.accepted, true);
    assertStringIncludes(body.artifactId, "artifact-");
    assertEquals(artifacts.length, 1);
    assertEquals(artifacts[0]?.kind, "screenshot_png");
    assertEquals(artifacts[0]?.contentType, "image/png");
    assertEquals(
      await evidenceArtifactStore.readBytes(artifacts[0]!.storageKey),
      pngBytes,
    );
  });
});

Deno.test("POST /runtime/sessions/:id/evidence-artifacts rejects unsupported evidence pairs without widening the runtime surface", async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      attempts: [buildAttemptRecord()],
      runtimeSessions: [
        buildRuntimeSessionRecord({
          capabilities: [
            "read_launch_context",
            "submit_evidence_artifact",
            "finalize_attempt",
          ],
          expiresAt: "2030-03-26T02:45:00Z",
        }),
      ],
    });
    const app = createApp({
      getRepository: () => repository,
      evidenceArtifactStore: {
        writeBytes() {
          return Promise.resolve();
        },
        readBytes() {
          return Promise.resolve(new Uint8Array());
        },
      },
    });

    const response = await app.request(
      "https://runtime.lantern.example/runtime/sessions/runtime-session-123/evidence-artifacts",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token-123",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "structured_json",
          contentType: "image/png",
          fileName: "submission.json",
          bodyBase64: btoa("invalid"),
        }),
      },
    );
    const body = (await response.json()) as {
      accepted: boolean;
      denial: {
        code: string;
        capability: string | null;
      };
    };

    assertEquals(response.status, 400);
    assertEquals(body.accepted, false);
    assertEquals(body.denial.code, "invalid_evidence_artifact");
    assertEquals(body.denial.capability, "submit_evidence_artifact");
    assertEquals(
      await repository.listAttemptEvidenceArtifacts("attempt-123"),
      [],
    );
  });
});
