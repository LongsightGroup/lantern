import { assertEquals } from '@std/assert';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import type { PythonLabArtifactStore } from './artifact_store.ts';
import { createInMemoryPythonLabRepository } from './repository_memory.ts';
import { purgeExpiredPythonLabs } from './retention.ts';

Deno.test('Python Lab retention deletes trial artifacts and packages while preserving live access requests', async () => {
  const pythonLabRepository = createInMemoryPythonLabRepository({
    labs: [{
      labId: 'lab-expired',
      visitorHash: 'visitor',
      requestIpHash: null,
      accessTokenHash: 'token',
      state: 'ready',
      authorDraft: {
        title: 'Add',
        prompt: 'Add two numbers.',
        starterCode: 'def add(left, right):\n    return 0\n',
        functionName: 'add',
      },
      packageVersionId: 1,
      privateArtifactKey: 'var/private-python-lab/lab-expired/assignment.json',
      failureMessage: null,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      expiresAt: '2026-07-08T00:00:00Z',
    }],
    runs: [{
      runId: 'run-1',
      attemptId: 'attempt-1',
      sourceArtifactKey: 'var/private-python-lab/submissions/attempt-1/run-1.py',
      phase: 'final',
      publicOutcomes: [],
      hiddenSummary: { passed: 0, total: 5 },
      scoreGiven: 0,
      scoreMaximum: 10,
      createdAt: '2026-07-01T00:00:00Z',
      sourcePersistedAt: '2026-07-01T00:00:00Z',
      finalizedAt: '2026-07-01T00:00:00Z',
    }],
    accessRequests: [
      {
        requestId: 'keep-request',
        labId: 'lab-expired',
        name: 'Instructor',
        workEmail: 'instructor@example.edu',
        institution: 'Example University',
        status: 'new',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
      },
      {
        requestId: 'expired-request',
        labId: 'lab-old',
        name: 'Old Instructor',
        workEmail: 'old@example.edu',
        institution: 'Example University',
        status: 'closed',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-04-01T00:00:00Z',
      },
    ],
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        appId: 'python-lab-lab-expired',
        version: '1.0.0',
        catalogVisibility: 'python_lab_trial',
      }),
    ],
  });
  const deleted: string[] = [];
  const artifacts: PythonLabArtifactStore = {
    writePendingDraft() {
      return Promise.resolve();
    },
    readPendingDraft() {
      return Promise.reject(new Error('not used by retention'));
    },
    writePrivateAssignment() {
      return Promise.resolve();
    },
    readPrivateAssignment() {
      return Promise.reject(new Error('not used by retention'));
    },
    writeSubmissionSource() {
      return Promise.resolve();
    },
    submissionSourceExists() {
      return Promise.resolve(false);
    },
    delete(key) {
      deleted.push(key);
      return Promise.resolve();
    },
  };

  const result = await purgeExpiredPythonLabs({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts,
    now: () => new Date('2026-07-13T00:00:00Z'),
  });

  assertEquals(result, { deletedLabs: 1, deletedAccessRequests: 1 });
  assertEquals(await pythonLabRepository.getLabById('lab-expired'), null);
  assertEquals(await repository.getPackageVersionById(1), null);
  assertEquals(deleted.includes('var/private-python-lab/lab-expired/assignment.json'), true);
  assertEquals(deleted.includes('var/private-python-lab/submissions/attempt-1/run-1.py'), true);
  assertEquals(
    deleted.includes('var/packages/chapter-4-asteroids/0.1.0/dist/index.html'),
    true,
  );
  assertEquals(
    (await pythonLabRepository.listAccessRequests()).map((request) => request.requestId),
    [
      'keep-request',
    ],
  );
});
