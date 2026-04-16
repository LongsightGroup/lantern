import { assertEquals } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildAttemptEvidenceArtifactRecord,
  buildAttemptRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import type { EvidenceArtifactStore } from './runtime/evidence_artifact_store.ts';

Deno.test('GET /admin/packages/:appId/deployment/evidence/:artifactId returns the stored anonymous evidence artifact', async () => {
  const evidenceBytes = new TextEncoder().encode(
    JSON.stringify({
      submissionMode: 'anonymous_submission',
      status: 'completed',
    }),
  );
  const repository = createInMemoryPackageReviewRepository({
    attempts: [
      buildAttemptRecord({
        appId: 'chapter-4-asteroids',
      }),
    ],
    attemptEvidenceArtifacts: [
      buildAttemptEvidenceArtifactRecord({
        artifactId: 'artifact-001',
        attemptId: 'attempt-123',
        kind: 'structured_json',
        contentType: 'application/json',
        fileName: 'submission.json',
        storageKey: 'var/attempt-evidence/attempt-123/artifact-001-submission.json',
      }),
    ],
  });
  const evidenceArtifactStore: EvidenceArtifactStore = {
    writeBytes() {
      return Promise.resolve();
    },
    readBytes(storageKey) {
      assertEquals(storageKey, 'var/attempt-evidence/attempt-123/artifact-001-submission.json');
      return Promise.resolve(evidenceBytes.slice());
    },
  };

  const response = await createApp({
    getRepository: () => repository,
    evidenceArtifactStore,
  }).request(
    'http://localhost/admin/packages/chapter-4-asteroids/deployment/evidence/artifact-001',
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/json');
  assertEquals(response.headers.get('content-disposition'), 'inline; filename="submission.json"');
  assertEquals(await response.text(), new TextDecoder().decode(evidenceBytes));
});

Deno.test('GET /admin/packages/:appId/deployment/evidence/:artifactId returns screenshot evidence inline through the same route', async () => {
  const evidenceBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const repository = createInMemoryPackageReviewRepository({
    attempts: [
      buildAttemptRecord({
        appId: 'chapter-4-asteroids',
      }),
    ],
    attemptEvidenceArtifacts: [
      buildAttemptEvidenceArtifactRecord({
        artifactId: 'artifact-002',
        attemptId: 'attempt-123',
        kind: 'screenshot_png',
        contentType: 'image/png',
        fileName: 'submission.png',
        storageKey: 'var/attempt-evidence/attempt-123/artifact-002-submission.png',
      }),
    ],
  });
  const evidenceArtifactStore: EvidenceArtifactStore = {
    writeBytes() {
      return Promise.resolve();
    },
    readBytes(storageKey) {
      assertEquals(storageKey, 'var/attempt-evidence/attempt-123/artifact-002-submission.png');
      return Promise.resolve(evidenceBytes.slice());
    },
  };

  const response = await createApp({
    getRepository: () => repository,
    evidenceArtifactStore,
  }).request(
    'http://localhost/admin/packages/chapter-4-asteroids/deployment/evidence/artifact-002',
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'image/png');
  assertEquals(response.headers.get('content-disposition'), 'inline; filename="submission.png"');
  assertEquals(new Uint8Array(await response.arrayBuffer()), evidenceBytes);
});
