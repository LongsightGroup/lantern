import { type EvaluatedCodeTestCase, parseJsonValue } from './contract.ts';

export interface PythonLabPrivateArtifact {
  readonly kind: 'assignment';
  readonly functionName: string;
  readonly referenceCode: string;
  readonly cases: readonly EvaluatedCodeTestCase[];
}

export interface PythonLabPendingDraftArtifact {
  readonly kind: 'pending_draft';
  readonly referenceCode: string;
}

export interface PythonLabArtifactStore {
  writePendingDraft(key: string, artifact: PythonLabPendingDraftArtifact): Promise<void>;
  readPendingDraft(key: string): Promise<PythonLabPendingDraftArtifact>;
  writePrivateAssignment(key: string, artifact: PythonLabPrivateArtifact): Promise<void>;
  readPrivateAssignment(key: string): Promise<PythonLabPrivateArtifact>;
  writeSubmissionSource(key: string, source: string): Promise<void>;
  submissionSourceExists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function createUnavailablePythonLabArtifactStore(message: string): PythonLabArtifactStore {
  const unavailable = (): never => {
    throw new Error(message);
  };

  return {
    writePendingDraft: unavailable,
    readPendingDraft: unavailable,
    writePrivateAssignment: unavailable,
    readPrivateAssignment: unavailable,
    writeSubmissionSource: unavailable,
    submissionSourceExists: unavailable,
    delete: unavailable,
  };
}

export interface PythonLabArtifactBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export function createR2PythonLabArtifactStore(
  bucket: PythonLabArtifactBucket,
): PythonLabArtifactStore {
  return {
    async writePendingDraft(key, artifact) {
      await bucket.put(key, JSON.stringify(artifact));
    },
    async readPendingDraft(key) {
      return await readArtifact(bucket, key, parsePendingDraftArtifact);
    },
    async writePrivateAssignment(key, artifact) {
      await bucket.put(key, JSON.stringify(artifact));
    },
    async readPrivateAssignment(key) {
      return await readArtifact(bucket, key, parsePrivateAssignmentArtifact);
    },
    async writeSubmissionSource(key, source) {
      await bucket.put(key, source);
    },
    async submissionSourceExists(key) {
      return (await bucket.get(key)) !== null;
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}

async function readArtifact<T>(
  bucket: PythonLabArtifactBucket,
  key: string,
  parse: (input: unknown) => T,
): Promise<T> {
  const object = await bucket.get(key);

  if (object === null) {
    throw new Error('Private Python assignment artifact was not found.');
  }

  return parse(JSON.parse(new TextDecoder().decode(await object.arrayBuffer())));
}

export function buildPythonLabPrivateArtifactKey(labId: string): string {
  return `var/private-python-lab/${labId}/assignment.json`;
}

export function buildPythonSubmissionArtifactKey(input: {
  attemptId: string;
  runId: string;
}): string {
  return `var/private-python-lab/submissions/${input.attemptId}/${input.runId}.py`;
}

function parsePrivateAssignmentArtifact(input: unknown): PythonLabPrivateArtifact {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Private Python assignment artifact was invalid.');
  }

  const record = input as Record<string, unknown>;

  if (
    record.kind !== 'assignment' ||
    typeof record.functionName !== 'string' ||
    typeof record.referenceCode !== 'string' ||
    !Array.isArray(record.cases)
  ) {
    throw new Error('Private Python assignment artifact was invalid.');
  }

  return {
    kind: 'assignment',
    functionName: record.functionName,
    referenceCode: record.referenceCode,
    cases: record.cases.map(parseEvaluatedCase),
  };
}

function parsePendingDraftArtifact(input: unknown): PythonLabPendingDraftArtifact {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Private Python draft artifact was invalid.');
  }

  const record = input as Record<string, unknown>;

  if (record.kind !== 'pending_draft' || typeof record.referenceCode !== 'string') {
    throw new Error('Private Python draft artifact was invalid.');
  }

  return { kind: 'pending_draft', referenceCode: record.referenceCode };
}

function parseEvaluatedCase(input: unknown): EvaluatedCodeTestCase {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Private Python test case was invalid.');
  }

  const record = input as Record<string, unknown>;

  if (
    typeof record.label !== 'string' ||
    (record.visibility !== 'public' && record.visibility !== 'hidden') ||
    !Array.isArray(record.args)
  ) {
    throw new Error('Private Python test case was invalid.');
  }

  return {
    label: record.label,
    visibility: record.visibility,
    args: record.args.map((value) => parseJsonValue(value, 'Private Python test args')),
    expected: parseJsonValue(record.expected, 'Private Python test expected result'),
  };
}
