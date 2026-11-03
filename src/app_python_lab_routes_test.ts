import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { createTestApp as createApp } from './test_helpers/app.ts';
import {
  buildImportedPackageVersion,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import type {
  PythonLabArtifactStore,
  PythonLabPendingDraftArtifact,
  PythonLabPrivateArtifact,
} from './python_lab/artifact_store.ts';
import { generatePythonLab } from './python_lab/lab_service.ts';
import { createInMemoryPythonLabRepository } from './python_lab/repository_memory.ts';
import type { PythonGraderSandboxFactory } from './python_lab/runner.ts';

test('public Python Lab creates one cookie-scoped trial, keeps it out of inventory, and captures a Canvas access request', async () => {
  const packageRepository = createInMemoryPackageReviewRepository();
  const pythonLabRepository = createInMemoryPythonLabRepository();
  const artifacts = createMemoryArtifactStore();
  const sandboxFactory = functionSandboxFactory();
  const testVectorGenerator = { generate: () => Promise.resolve(generatedCases()) };
  const importPackageFromSource = () =>
    Promise.resolve(
      buildImportedPackageVersion({
        appId: 'public-python-lab-fixture',
        version: '1.0.0',
        capabilities: ['read_launch_context', 'read_activity_content', 'run_code_submission'],
        grading: { mode: 'sandbox', rubricFile: null, maxScore: 10 },
      }),
    );
  let verified = 0;
  const app = createApp({
    getRepository: () => packageRepository,
    pythonLabRepository,
    pythonLabArtifactStore: artifacts,
    pythonGraderSandboxFactory: sandboxFactory,
    pythonTestVectorGenerator: testVectorGenerator,
    pythonLabHumanVerifier: {
      verify() {
        verified += 1;
        return Promise.resolve();
      },
    },
    importPackageFromSource,
    pythonLabGenerationScheduler: {
      async schedule({ labId }) {
        const lab = await pythonLabRepository.getLabById(labId);

        if (lab === null) {
          throw new Error('Python Lab was not found.');
        }

        await generatePythonLab({
          lab,
          repository: packageRepository,
          pythonLabRepository,
          pythonLabArtifactStore: artifacts,
          sandboxFactory,
          testVectorGenerator,
          importPackageFromSource,
          createId: () => crypto.randomUUID(),
        });
        return { workflowInstanceId: labId };
      },
    },
  });
  const form = new URLSearchParams({
    title: 'Add numbers',
    prompt: 'Write a function that returns the sum of two integers.',
    functionName: 'add',
    starterCode: 'def add(left, right):\n    return 0\n',
    referenceCode: 'def add(left, right):\n    return left + right\n',
    'cf-turnstile-response': 'verified-token',
  });

  const createResponse = await app.request('https://lantern.example/autograder/labs', {
    method: 'POST',
    headers: formHeaders(),
    body: form,
  });
  const location = createResponse.headers.get('location');
  const cookie = cookieHeader(createResponse.headers.get('set-cookie'));

  assertEquals(createResponse.status, 303);
  assertEquals(verified, 1);
  assertEquals(location?.startsWith('/autograder/labs/'), true);
  assertEquals((await packageRepository.listPackageVersions()).length, 0);

  const labId = location?.split('/').at(-1) ?? '';
  const createdLab = await pythonLabRepository.getLabById(labId);
  assertEquals(createdLab === null, false);
  assertEquals('referenceCode' in (createdLab?.authorDraft ?? {}), false);

  const labPath = location ?? '';
  const unauthenticated = await app.request(`https://lantern.example${labPath}`);
  const labPage = await app.request(`https://lantern.example${labPath}`, {
    headers: { cookie },
  });
  const repeat = await app.request('https://lantern.example/autograder/labs', {
    method: 'POST',
    headers: { ...formHeaders(), cookie },
    body: form,
  });

  assertEquals(unauthenticated.status, 403);
  assertEquals(labPage.status, 200);
  assertStringIncludes(await labPage.text(), 'Canvas access');
  assertEquals(repeat.status, 429);

  const accessRequest = await app.request(`https://lantern.example${labPath}/access-requests`, {
    method: 'POST',
    headers: { ...formHeaders(), cookie },
    body: new URLSearchParams({
      name: 'Ada Instructor',
      workEmail: 'ada@example.edu',
      institution: 'Example University',
    }),
  });

  assertEquals(accessRequest.status, 201);
  assertEquals(
    (await pythonLabRepository.listAccessRequests()).map((request) => ({
      name: request.name,
      workEmail: request.workEmail,
      institution: request.institution,
      status: request.status,
    })),
    [
      {
        name: 'Ada Instructor',
        workEmail: 'ada@example.edu',
        institution: 'Example University',
        status: 'new',
      },
    ],
  );
});

test('public Python Lab queues generation and exposes a meaningful generating status', async () => {
  const packageRepository = createInMemoryPackageReviewRepository();
  const pythonLabRepository = createInMemoryPythonLabRepository();
  const queuedLabIds: string[] = [];
  const app = createApp({
    getRepository: () => packageRepository,
    pythonLabRepository,
    pythonLabArtifactStore: createMemoryArtifactStore(),
    pythonLabHumanVerifier: { verify: () => Promise.resolve() },
    pythonLabGenerationScheduler: {
      schedule({ labId }) {
        queuedLabIds.push(labId);
        return Promise.resolve({ workflowInstanceId: labId });
      },
    },
  });

  const createResponse = await app.request('https://lantern.example/autograder/labs', {
    method: 'POST',
    headers: formHeaders(),
    body: labCreateForm(),
  });
  const location = createResponse.headers.get('location');
  const cookie = cookieHeader(createResponse.headers.get('set-cookie'));
  const statusResponse = await app.request(`https://lantern.example${location}/status`, {
    headers: { cookie },
  });

  assertEquals(createResponse.status, 303);
  assertEquals(await statusResponse.json(), { state: 'generating', failureMessage: null });
  assertEquals(queuedLabIds.length, 1);
  assertEquals((await packageRepository.listPackageVersions()).length, 0);
});

test('concurrent Lab creates admit only one daily visitor reservation', async () => {
  const packageRepository = createInMemoryPackageReviewRepository();
  const pythonLabRepository = createInMemoryPythonLabRepository();
  const queuedLabIds: string[] = [];
  const app = createApp({
    getRepository: () => packageRepository,
    pythonLabRepository,
    pythonLabArtifactStore: createMemoryArtifactStore(),
    pythonLabHumanVerifier: { verify: () => Promise.resolve() },
    pythonLabGenerationScheduler: {
      schedule({ labId }) {
        queuedLabIds.push(labId);
        return Promise.resolve({ workflowInstanceId: labId });
      },
    },
  });
  const headers = {
    ...formHeaders(),
    cookie: 'lantern_python_lab_visitor=shared-visitor',
  };

  const responses = await Promise.all([
    app.request('https://lantern.example/autograder/labs', {
      method: 'POST',
      headers,
      body: labCreateForm(),
    }),
    app.request('https://lantern.example/autograder/labs', {
      method: 'POST',
      headers,
      body: labCreateForm(),
    }),
  ]);

  assertEquals(
    responses.map((response) => response.status).sort((left, right) => left - right),
    [303, 429],
  );
  assertEquals(queuedLabIds.length, 1);
});

function formHeaders(): Record<string, string> {
  return {
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    origin: 'https://lantern.example',
    'cf-connecting-ip': '198.51.100.42',
  };
}

function labCreateForm(): URLSearchParams {
  return new URLSearchParams({
    title: 'Add numbers',
    prompt: 'Write a function that returns the sum of two integers.',
    functionName: 'add',
    starterCode: 'def add(left, right):\n    return 0\n',
    referenceCode: 'def add(left, right):\n    return left + right\n',
    'cf-turnstile-response': 'verified-token',
  });
}

function cookieHeader(value: string | null): string {
  if (value === null) {
    throw new Error('Expected Lab cookies.');
  }

  return value
    .split(', ')
    .map((part) => part.split(';')[0])
    .join('; ');
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

function createMemoryArtifactStore(): PythonLabArtifactStore {
  const assignments = new Map<string, PythonLabPrivateArtifact>();
  const pendingDrafts = new Map<string, PythonLabPendingDraftArtifact>();
  const sources = new Map<string, string>();

  return {
    writePendingDraft(key, artifact) {
      pendingDrafts.set(key, structuredClone(artifact));
      return Promise.resolve();
    },
    readPendingDraft(key) {
      const artifact = pendingDrafts.get(key);
      if (artifact === undefined) return Promise.reject(new Error('Draft was not found.'));
      return Promise.resolve(structuredClone(artifact));
    },
    writePrivateAssignment(key, artifact) {
      assignments.set(key, structuredClone(artifact));
      return Promise.resolve();
    },
    readPrivateAssignment(key) {
      const artifact = assignments.get(key);
      if (artifact === undefined) return Promise.reject(new Error('Assignment was not found.'));
      return Promise.resolve(structuredClone(artifact));
    },
    writeSubmissionSource(key, source) {
      sources.set(key, source);
      return Promise.resolve();
    },
    submissionSourceExists(key) {
      return Promise.resolve(sources.has(key));
    },
    delete(key) {
      assignments.delete(key);
      pendingDrafts.delete(key);
      sources.delete(key);
      return Promise.resolve();
    },
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
