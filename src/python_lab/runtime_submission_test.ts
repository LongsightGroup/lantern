import { assertEquals, assertRejects } from '@std/assert';
import {
  buildAttemptRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import { buildRuntimeSessionRecord } from '../test_helpers/lti.ts';
import type { PythonLabArtifactStore, PythonLabPrivateArtifact } from './artifact_store.ts';
import type { PythonLabRepository } from './repository.ts';
import { createInMemoryPythonLabRepository } from './repository_memory.ts';
import type { PythonGraderSandboxFactory } from './runner.ts';
import { runRuntimeCodeSubmission } from './runtime_submission.ts';

Deno.test('Python runtime submissions keep practice unfinalized and make final runs idempotent', async () => {
  const repository = createRepository();
  const pythonLabRepository = createInMemoryPythonLabRepository({
    definitions: [{
      packageVersionId: 1,
      functionName: 'add',
      privateArtifactKey: 'var/private-python-lab/lab-123/assignment.json',
      createdAt: '2026-07-13T00:00:00Z',
    }],
  });
  const artifacts = createArtifactStore(privateArtifact());
  const session = runtimeSession();

  const practice = await runRuntimeCodeSubmission({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts,
    sandboxFactory: functionSandboxFactory(),
    session,
    payload: { phase: 'practice', source: 'def add(left, right):\n    return left + right\n' },
    createId: createIds(),
  });

  assertEquals(practice.phase, 'practice');
  assertEquals(practice.scoreGiven, null);
  assertEquals((await repository.getAttemptById('attempt-123'))?.finalizedAt, null);

  const firstFinal = await runRuntimeCodeSubmission({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts,
    sandboxFactory: functionSandboxFactory(),
    session,
    payload: { phase: 'final', source: 'def add(left, right):\n    return left + right\n' },
    createId: createIds(),
  });
  const repeatedFinal = await runRuntimeCodeSubmission({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts,
    sandboxFactory: functionSandboxFactory(),
    session,
    payload: { phase: 'final', source: 'def add(left, right):\n    return 0\n' },
    createId: createIds(),
  });

  assertEquals(firstFinal.scoreGiven, 10);
  assertEquals(firstFinal.scoreMaximum, 10);
  assertEquals(firstFinal.gradePublished, false);
  assertEquals(repeatedFinal.alreadyFinalized, true);
  assertEquals(repeatedFinal.scoreGiven, 10);
  assertEquals(
    (await pythonLabRepository.getFinalCodeSubmissionRunByAttemptId('attempt-123'))?.scoreGiven,
    10,
  );
  assertEquals((await repository.getAttemptById('attempt-123'))?.status, 'completed');
});

Deno.test('Python runtime submission never finalizes or publishes a grade when the runner fails', async () => {
  const repository = createRepository();
  const pythonLabRepository = createInMemoryPythonLabRepository({
    definitions: [{
      packageVersionId: 1,
      functionName: 'add',
      privateArtifactKey: 'var/private-python-lab/lab-123/assignment.json',
      createdAt: '2026-07-13T00:00:00Z',
    }],
  });

  await assertRejects(
    () =>
      runRuntimeCodeSubmission({
        repository,
        pythonLabRepository,
        pythonLabArtifactStore: createArtifactStore(privateArtifact()),
        sandboxFactory: {
          create() {
            return Promise.reject(new Error('sandbox unavailable'));
          },
        },
        session: runtimeSession(),
        payload: { phase: 'final', source: 'def add(left, right):\n    return left + right\n' },
        createId: createIds(),
      }),
    Error,
    'Python execution infrastructure did not finish',
  );

  assertEquals((await repository.getAttemptById('attempt-123'))?.finalizedAt, null);
  assertEquals(await pythonLabRepository.getFinalCodeSubmissionRunByAttemptId('attempt-123'), null);
});

Deno.test('concurrent final submissions reserve one source artifact and recover after the winner finishes', async () => {
  const repository = createRepository();
  const pythonLabRepository = createInMemoryPythonLabRepository({ definitions: [definition()] });
  const blockingArtifacts = createBlockingArtifactStore(privateArtifact());
  const first = runRuntimeCodeSubmission({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: blockingArtifacts.store,
    sandboxFactory: functionSandboxFactory(),
    session: runtimeSession(),
    payload: { phase: 'final', source: 'def add(left, right):\n    return left + right\n' },
    createId: createIds(),
  });

  await blockingArtifacts.sourceWriteStarted;

  await assertRejects(
    () =>
      runRuntimeCodeSubmission({
        repository,
        pythonLabRepository,
        pythonLabArtifactStore: blockingArtifacts.store,
        sandboxFactory: functionSandboxFactory(),
        session: runtimeSession(),
        payload: { phase: 'final', source: 'def add(left, right):\n    return 0\n' },
        createId: createIds(),
      }),
    Error,
    'still being recorded',
  );

  blockingArtifacts.releaseSourceWrite();
  const winner = await first;
  const retry = await runRuntimeCodeSubmission({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: blockingArtifacts.store,
    sandboxFactory: functionSandboxFactory(),
    session: runtimeSession(),
    payload: { phase: 'final', source: 'def add(left, right):\n    return 0\n' },
    createId: createIds(),
  });

  assertEquals(winner.scoreGiven, 10);
  assertEquals(retry.alreadyFinalized, true);
  assertEquals(blockingArtifacts.sourceKeys.size, 1);
  assertEquals(
    (await pythonLabRepository.getFinalCodeSubmissionRunByAttemptId('attempt-123'))
      ?.sourcePersistedAt === null,
    false,
  );
});

Deno.test('a final run whose source was stored before its database update is recovered on retry', async () => {
  const repository = createRepository();
  const baseRepository = createInMemoryPythonLabRepository({ definitions: [definition()] });
  let failPersistence = true;
  const pythonLabRepository: PythonLabRepository = {
    ...baseRepository,
    markCodeSubmissionSourcePersisted(input) {
      if (failPersistence) {
        failPersistence = false;
        return Promise.reject(new Error('D1 update interrupted'));
      }
      return baseRepository.markCodeSubmissionSourcePersisted(input);
    },
  };
  const artifacts = createArtifactStore(privateArtifact());

  await assertRejects(
    () =>
      runRuntimeCodeSubmission({
        repository,
        pythonLabRepository,
        pythonLabArtifactStore: artifacts,
        sandboxFactory: functionSandboxFactory(),
        session: runtimeSession(),
        payload: { phase: 'final', source: 'def add(left, right):\n    return left + right\n' },
        createId: createIds(),
      }),
    Error,
    'D1 update interrupted',
  );

  const recovered = await runRuntimeCodeSubmission({
    repository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts,
    sandboxFactory: functionSandboxFactory(),
    session: runtimeSession(),
    payload: { phase: 'final', source: 'def add(left, right):\n    return 0\n' },
    createId: createIds(),
  });

  assertEquals(recovered.scoreGiven, 10);
  assertEquals(recovered.alreadyFinalized, false);
  assertEquals((await repository.getAttemptById('attempt-123'))?.status, 'completed');
});

function createRepository() {
  return createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        appId: 'python-lab-lab-123',
        version: '1.0.0',
        capabilities: [
          'read_launch_context',
          'read_activity_content',
          'run_code_submission',
        ],
        grading: { mode: 'sandbox', rubricFile: null, maxScore: 10 },
        catalogVisibility: 'python_lab_trial',
      }),
    ],
    attempts: [
      buildAttemptRecord({
        appId: 'python-lab-lab-123',
        packageVersion: '1.0.0',
      }),
    ],
  });
}

function definition() {
  return {
    packageVersionId: 1,
    functionName: 'add',
    privateArtifactKey: 'var/private-python-lab/lab-123/assignment.json',
    createdAt: '2026-07-13T00:00:00Z',
  };
}

function runtimeSession() {
  return buildRuntimeSessionRecord({
    appId: 'python-lab-lab-123',
    packageVersion: '1.0.0',
    capabilities: [
      'read_launch_context',
      'read_activity_content',
      'run_code_submission',
    ],
    preview: { previewSessionId: 'preview-session-123' },
  });
}

function privateArtifact(): PythonLabPrivateArtifact {
  return {
    kind: 'assignment',
    functionName: 'add',
    referenceCode: 'def add(left, right):\n    return left + right\n',
    cases: [
      { label: 'one plus two', visibility: 'public', args: [1, 2], expected: 3 },
      { label: 'zero plus four', visibility: 'public', args: [0, 4], expected: 4 },
      { label: 'negative plus five', visibility: 'public', args: [-1, 5], expected: 4 },
      { label: 'large', visibility: 'hidden', args: [500, 700], expected: 1200 },
      { label: 'negative', visibility: 'hidden', args: [-2, -3], expected: -5 },
      { label: 'mixed', visibility: 'hidden', args: [-3, 9], expected: 6 },
      { label: 'identity', visibility: 'hidden', args: [0, 0], expected: 0 },
      { label: 'boundary', visibility: 'hidden', args: [999, 1], expected: 1000 },
    ],
  };
}

function createArtifactStore(artifact: PythonLabPrivateArtifact): PythonLabArtifactStore {
  const submittedSources = new Map<string, string>();

  return {
    writePendingDraft() {
      return Promise.resolve();
    },
    readPendingDraft() {
      return Promise.reject(new Error('not used by runtime submissions'));
    },
    writePrivateAssignment() {
      return Promise.resolve();
    },
    readPrivateAssignment() {
      return Promise.resolve(structuredClone(artifact));
    },
    writeSubmissionSource(key, source) {
      submittedSources.set(key, source);
      return Promise.resolve();
    },
    submissionSourceExists(key) {
      return Promise.resolve(submittedSources.has(key));
    },
    delete(key) {
      submittedSources.delete(key);
      return Promise.resolve();
    },
  };
}

function createBlockingArtifactStore(artifact: PythonLabPrivateArtifact): {
  readonly store: PythonLabArtifactStore;
  readonly sourceWriteStarted: Promise<void>;
  readonly releaseSourceWrite: () => void;
  readonly sourceKeys: ReadonlySet<string>;
} {
  const sourceKeys = new Set<string>();
  let notifySourceWriteStarted: () => void = () => undefined;
  const sourceWriteStarted = new Promise<void>((resolve) => {
    notifySourceWriteStarted = resolve;
  });
  let releaseSourceWrite: () => void = () => undefined;
  const sourceWriteReleased = new Promise<void>((resolve) => {
    releaseSourceWrite = resolve;
  });

  return {
    store: {
      writePendingDraft() {
        return Promise.resolve();
      },
      readPendingDraft() {
        return Promise.reject(new Error('not used by runtime submissions'));
      },
      writePrivateAssignment() {
        return Promise.resolve();
      },
      readPrivateAssignment() {
        return Promise.resolve(structuredClone(artifact));
      },
      async writeSubmissionSource(key) {
        notifySourceWriteStarted();
        await sourceWriteReleased;
        sourceKeys.add(key);
      },
      submissionSourceExists(key) {
        return Promise.resolve(sourceKeys.has(key));
      },
      delete(key) {
        sourceKeys.delete(key);
        return Promise.resolve();
      },
    },
    sourceWriteStarted,
    releaseSourceWrite,
    sourceKeys,
  };
}

function functionSandboxFactory(): PythonGraderSandboxFactory {
  return {
    create() {
      let source = '';
      let request = '';

      return Promise.resolve({
        writeFile(path, contents) {
          if (path === '/workspace/solution.py') source = contents;
          if (path === '/workspace/request.json') request = contents;
          return Promise.resolve();
        },
        exec() {
          const args = (JSON.parse(request) as { args: number[] }).args;
          const value = source.includes('return 0') ? 0 : args[0]! + args[1]!;
          return Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({ ok: true, value }),
            stderr: '',
          });
        },
        destroy() {
          return Promise.resolve();
        },
      });
    },
  };
}

function createIds(): () => string {
  let value = 0;
  return () => `test-${++value}`;
}
