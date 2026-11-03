import { test } from 'vite-plus/test';
import { assertEquals } from '@std/assert';
import {
  buildImportedPackageVersion,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import type {
  PythonLabArtifactStore,
  PythonLabPendingDraftArtifact,
  PythonLabPrivateArtifact,
} from './artifact_store.ts';
import { generatePythonLab } from './lab_service.ts';
import type { PythonLabRecord, PythonLabRepository } from './repository.ts';
import { createInMemoryPythonLabRepository } from './repository_memory.ts';
import type { PythonGraderSandboxFactory } from './runner.ts';

test('failed Lab materialization removes its private artifact and non-catalog package', async () => {
  const packageRepository = createInMemoryPackageReviewRepository();
  const baseRepository = createInMemoryPythonLabRepository();
  const lab = generatingLab();
  await baseRepository.reserveLab({
    lab,
    visitorDay: '2026-07-13',
    ipWindowStartedAt: null,
  });
  const pythonLabRepository: PythonLabRepository = {
    ...baseRepository,
    createCodeAssignmentDefinition() {
      return Promise.reject(new Error('definition persistence interrupted'));
    },
  };
  const artifacts = createArtifactStore();
  await artifacts.store.writePendingDraft(lab.privateArtifactKey!, {
    kind: 'pending_draft',
    referenceCode: 'def add(left, right):\n    return left + right\n',
  });

  const result = await generatePythonLab({
    lab,
    repository: packageRepository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts.store,
    sandboxFactory: functionSandboxFactory(),
    testVectorGenerator: { generate: () => Promise.resolve(generatedCases()) },
    importPackageFromSource: () =>
      Promise.resolve(
        buildImportedPackageVersion({
          appId: 'python-lab-lab-123',
          version: '1.0.0',
          capabilities: ['read_activity_content', 'run_code_submission'],
          grading: { mode: 'sandbox', rubricFile: null, maxScore: 10 },
        }),
      ),
    createId: createIds(),
    now: () => new Date('2026-07-13T00:00:00Z'),
  });

  assertEquals(result.state, 'failed');
  assertEquals(result.packageVersionId, 1);
  assertEquals(await packageRepository.getPackageVersionById(1), null);
  assertEquals(artifacts.deleted.has(lab.privateArtifactKey!), true);
  assertEquals(artifacts.deleted.size > 1, true);
  assertEquals('referenceCode' in result.authorDraft, false);
});

function generatingLab(): PythonLabRecord {
  return {
    labId: 'lab-123',
    visitorHash: 'visitor',
    requestIpHash: null,
    accessTokenHash: 'token',
    state: 'generating',
    authorDraft: {
      title: 'Add numbers',
      prompt: 'Write a function that returns the sum of two integers.',
      starterCode: 'def add(left, right):\n    return 0\n',
      functionName: 'add',
    },
    packageVersionId: null,
    privateArtifactKey: 'var/private-python-lab/lab-123/assignment.json',
    failureMessage: null,
    createdAt: '2026-07-13T00:00:00Z',
    updatedAt: '2026-07-13T00:00:00Z',
    expiresAt: '2026-07-20T00:00:00Z',
  };
}

function createArtifactStore(): {
  readonly store: PythonLabArtifactStore;
  readonly deleted: ReadonlySet<string>;
} {
  const pendingDrafts = new Map<string, PythonLabPendingDraftArtifact>();
  const assignments = new Map<string, PythonLabPrivateArtifact>();
  const deleted = new Set<string>();

  return {
    store: {
      writePendingDraft(key, artifact) {
        pendingDrafts.set(key, structuredClone(artifact));
        return Promise.resolve();
      },
      readPendingDraft(key) {
        const artifact = pendingDrafts.get(key);
        return artifact === undefined
          ? Promise.reject(new Error('Python Lab pending draft was not found.'))
          : Promise.resolve(structuredClone(artifact));
      },
      writePrivateAssignment(key, artifact) {
        assignments.set(key, structuredClone(artifact));
        return Promise.resolve();
      },
      readPrivateAssignment(key) {
        const artifact = assignments.get(key);
        return artifact === undefined
          ? Promise.reject(new Error('Python Lab assignment artifact was not found.'))
          : Promise.resolve(structuredClone(artifact));
      },
      writeSubmissionSource() {
        return Promise.resolve();
      },
      submissionSourceExists() {
        return Promise.resolve(false);
      },
      delete(key) {
        deleted.add(key);
        pendingDrafts.delete(key);
        assignments.delete(key);
        return Promise.resolve();
      },
    },
    deleted,
  };
}

function generatedCases() {
  return {
    cases: [
      { label: 'one plus two', visibility: 'public', args: [1, 2] },
      { label: 'zero plus four', visibility: 'public', args: [0, 4] },
      { label: 'negative plus five', visibility: 'public', args: [-1, 5] },
      { label: 'large', visibility: 'hidden', args: [500, 700] },
      { label: 'negative', visibility: 'hidden', args: [-2, -3] },
      { label: 'mixed', visibility: 'hidden', args: [-3, 9] },
      { label: 'identity', visibility: 'hidden', args: [0, 0] },
      { label: 'boundary', visibility: 'hidden', args: [999, 1] },
    ],
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
