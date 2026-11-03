import { test } from 'vite-plus/test';
import { assertEquals, assertRejects } from '@std/assert';
import { type JsonValue } from './contract.ts';
import {
  calculatePythonScore,
  evaluatePythonSubmission,
  generateAndValidatePythonAssignment,
  PYTHON_SANDBOX_CONCURRENCY,
  PythonAssignmentValidationError,
} from './service.ts';
import type { PythonGraderSandbox, PythonGraderSandboxFactory } from './runner.ts';

test('generateAndValidatePythonAssignment derives expected values and requires diagnostic starter code', async () => {
  const assignment = await generateAndValidatePythonAssignment({
    draft: draft(),
    generator: { generate: () => Promise.resolve(generatedCases()) },
    sandboxFactory: functionSandboxFactory(),
    createOneTimeId: createIds(),
  });

  assertEquals(assignment.publicContent.publicCases.length, 3);
  assertEquals(assignment.privateCases.length, 8);
  assertEquals(assignment.privateCases[0]?.expected, 3);
});

test('generateAndValidatePythonAssignment rejects starter code that passes all public cases', async () => {
  await assertRejects(
    () =>
      generateAndValidatePythonAssignment({
        draft: { ...draft(), starterCode: 'def add(left, right):\n    return left + right\n' },
        generator: { generate: () => Promise.resolve(generatedCases()) },
        sandboxFactory: functionSandboxFactory(),
        createOneTimeId: createIds(),
      }),
    PythonAssignmentValidationError,
    'Starter code must fail',
  );
});

test('generateAndValidatePythonAssignment rejects an unavailable runner instead of accepting the starter failure', async () => {
  await assertRejects(
    () =>
      generateAndValidatePythonAssignment({
        draft: draft(),
        generator: { generate: () => Promise.resolve(generatedCases()) },
        sandboxFactory: {
          create() {
            return Promise.reject(new Error('sandbox unavailable'));
          },
        },
        createOneTimeId: createIds(),
      }),
    PythonAssignmentValidationError,
    'Reference solution failed',
  );
});

test('evaluatePythonSubmission redacts hidden detail and calculates a ten point final score', async () => {
  const assignment = await generateAndValidatePythonAssignment({
    draft: draft(),
    generator: { generate: () => Promise.resolve(generatedCases()) },
    sandboxFactory: functionSandboxFactory(),
    createOneTimeId: createIds(),
  });
  const result = await evaluatePythonSubmission({
    source: 'def add(left, right):\n    return left + right\n',
    contract: draft().contract,
    cases: assignment.privateCases,
    phase: 'final',
    sandboxFactory: functionSandboxFactory(),
    createOneTimeId: createIds(),
  });

  assertEquals(result.publicOutcomes.length, 3);
  assertEquals(result.hiddenSummary, { passed: 5, total: 5 });
  assertEquals(result.scoreGiven, 10);
  assertEquals(result.scoreMaximum, 10);
  assertEquals(calculatePythonScore(7, 8), 8.75);
});

test('evaluatePythonSubmission bounds concurrent Sandbox execution', async () => {
  const assignment = await generateAndValidatePythonAssignment({
    draft: draft(),
    generator: { generate: () => Promise.resolve(generatedCases()) },
    sandboxFactory: functionSandboxFactory(),
    createOneTimeId: createIds(),
  });
  const tracker = createConcurrencyTrackingSandboxFactory();
  const result = await evaluatePythonSubmission({
    source: 'def add(left, right):\n    return left + right\n',
    contract: draft().contract,
    cases: assignment.privateCases,
    phase: 'final',
    sandboxFactory: tracker.factory,
    createOneTimeId: createIds(),
  });

  assertEquals(result.runnerFailed, false);
  assertEquals(tracker.maxActive, PYTHON_SANDBOX_CONCURRENCY);
  assertEquals(tracker.active, 0);
});

function draft() {
  return {
    title: 'Add numbers',
    prompt: 'Write a function that returns the sum of two integers.',
    starterCode: 'def add(left, right):\n    return 0\n',
    referenceCode: 'def add(left, right):\n    return left + right\n',
    contract: { functionName: 'add', maxScore: 10 as const },
  };
}

function generatedCases() {
  return {
    cases: [
      { label: 'one plus two', visibility: 'public', args: [1, 2] },
      { label: 'zero plus four', visibility: 'public', args: [0, 4] },
      { label: 'negative plus five', visibility: 'public', args: [-1, 5] },
      { label: 'large numbers', visibility: 'hidden', args: [500, 700] },
      { label: 'negative numbers', visibility: 'hidden', args: [-2, -3] },
      { label: 'mixed signs', visibility: 'hidden', args: [-3, 9] },
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
          if (path === '/workspace/solution.py') {
            source = contents;
          }

          if (path === '/workspace/request.json') {
            request = contents;
          }

          return Promise.resolve();
        },
        exec() {
          const payload = JSON.parse(request) as { args: JsonValue[] };
          const left = payload.args[0];
          const right = payload.args[1];
          const value = source.includes('return 0')
            ? 0
            : typeof left === 'number' && typeof right === 'number'
              ? left + right
              : null;
          return Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({ ok: true, value }),
            stderr: '',
          });
        },
        destroy() {
          return Promise.resolve();
        },
      } satisfies PythonGraderSandbox);
    },
  };
}

function createConcurrencyTrackingSandboxFactory(): {
  readonly factory: PythonGraderSandboxFactory;
  readonly maxActive: number;
  readonly active: number;
} {
  let active = 0;
  let maxActive = 0;

  return {
    get maxActive() {
      return maxActive;
    },
    get active() {
      return active;
    },
    factory: {
      create() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        let request = '';

        return Promise.resolve({
          writeFile(path, contents) {
            if (path === '/workspace/request.json') request = contents;
            return Promise.resolve();
          },
          async exec() {
            await new Promise<void>((resolve) => setTimeout(resolve, 1));
            const args = (JSON.parse(request) as { args: number[] }).args;
            return {
              exitCode: 0,
              stdout: JSON.stringify({ ok: true, value: args[0]! + args[1]! }),
              stderr: '',
            };
          },
          destroy() {
            active -= 1;
            return Promise.resolve();
          },
        } satisfies PythonGraderSandbox);
      },
    },
  };
}

function createIds(): () => string {
  let next = 0;
  return () => `test-run-${++next}`;
}
