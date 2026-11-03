import {
  buildPublicPythonAssignmentContent,
  type EvaluatedCodeTestCase,
  type GeneratedCodeTestInput,
  type JsonValue,
  parseGeneratedCodeTestInputs,
  type PublicPythonAssignmentContent,
  PYTHON_ASSIGNMENT_MAX_SCORE,
  type PythonAssignmentDraft,
} from './contract.ts';
import {
  executePythonFunction,
  type PythonExecutionOutcome,
  type PythonGraderSandboxFactory,
} from './runner.ts';

export type CodeRunPhase = 'practice' | 'final' | 'candidate';
export type CodeTestStatus = 'passed' | 'failed';
export const PYTHON_SANDBOX_CONCURRENCY = 3;

export interface CodeTestOutcome {
  readonly label: string;
  readonly status: CodeTestStatus;
  readonly message: string | null;
}

export interface CodeSubmissionEvaluation {
  readonly phase: CodeRunPhase;
  readonly publicOutcomes: readonly CodeTestOutcome[];
  readonly hiddenSummary: { readonly passed: number; readonly total: number } | null;
  readonly scoreGiven: number | null;
  readonly scoreMaximum: number | null;
  readonly runnerFailed: boolean;
}

export interface EvaluatedPythonAssignmentDefinition {
  readonly publicContent: PublicPythonAssignmentContent;
  readonly privateCases: readonly EvaluatedCodeTestCase[];
}

export interface PythonTestVectorGenerator {
  generate(input: {
    readonly title: string;
    readonly prompt: string;
    readonly functionName: string;
  }): Promise<unknown>;
}

export class PythonAssignmentValidationError extends Error {
  readonly _tag = 'PythonAssignmentValidationError' as const;

  constructor(message: string) {
    super(message);
  }
}

export async function generateAndValidatePythonAssignment(input: {
  readonly draft: PythonAssignmentDraft;
  readonly generator: PythonTestVectorGenerator;
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly createOneTimeId: () => string;
}): Promise<EvaluatedPythonAssignmentDefinition> {
  const generated = parseGeneratedCodeTestInputs(
    await input.generator.generate({
      title: input.draft.title,
      prompt: input.draft.prompt,
      functionName: input.draft.contract.functionName,
    }),
  );
  const privateCases = await deriveExpectedCases({
    source: input.draft.referenceCode,
    contract: input.draft.contract,
    cases: generated,
    sandboxFactory: input.sandboxFactory,
    createOneTimeId: input.createOneTimeId,
  });
  const starterEvaluation = await evaluatePythonSubmission({
    source: input.draft.starterCode,
    contract: input.draft.contract,
    cases: privateCases,
    phase: 'practice',
    sandboxFactory: input.sandboxFactory,
    createOneTimeId: input.createOneTimeId,
  });

  if (starterEvaluation.runnerFailed) {
    throw new PythonAssignmentValidationError(
      'Starter code could not be validated because the Python runner did not complete.',
    );
  }

  if (starterEvaluation.publicOutcomes.every((outcome) => outcome.status === 'passed')) {
    throw new PythonAssignmentValidationError(
      'Starter code must fail at least one public test before the Lab can be created.',
    );
  }

  return {
    publicContent: buildPublicPythonAssignmentContent({ draft: input.draft, cases: privateCases }),
    privateCases,
  };
}

export async function deriveExpectedCases(input: {
  readonly source: string;
  readonly contract: PythonAssignmentDraft['contract'];
  readonly cases: readonly GeneratedCodeTestInput[];
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly createOneTimeId: () => string;
}): Promise<EvaluatedCodeTestCase[]> {
  const executions = await mapWithConcurrency(
    input.cases,
    PYTHON_SANDBOX_CONCURRENCY,
    async (testCase) =>
      await executePythonFunction({
        sandboxFactory: input.sandboxFactory,
        oneTimeId: input.createOneTimeId(),
        source: input.source,
        contract: input.contract,
        args: testCase.args,
      }),
  );

  return input.cases.map((testCase, index) => {
    const execution = executions[index]!;
    if (execution.status === 'failed') {
      throw new PythonAssignmentValidationError(
        `Reference solution failed ${testCase.label}: ${execution.message}`,
      );
    }

    return { ...testCase, expected: execution.value };
  });
}

export async function evaluatePythonSubmission(input: {
  readonly source: string;
  readonly contract: PythonAssignmentDraft['contract'];
  readonly cases: readonly EvaluatedCodeTestCase[];
  readonly phase: CodeRunPhase;
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly createOneTimeId: () => string;
}): Promise<CodeSubmissionEvaluation> {
  const cases =
    input.phase === 'practice'
      ? input.cases.filter((testCase) => testCase.visibility === 'public')
      : input.cases;
  const executions = await mapWithConcurrency(
    cases,
    PYTHON_SANDBOX_CONCURRENCY,
    async (testCase) =>
      await executePythonFunction({
        sandboxFactory: input.sandboxFactory,
        oneTimeId: input.createOneTimeId(),
        source: input.source,
        contract: input.contract,
        args: testCase.args,
      }),
  );
  const outcomes = cases.map((testCase, index) => {
    const execution = executions[index]!;
    return {
      visibility: testCase.visibility,
      ...toCodeTestOutcome(testCase, execution),
    };
  });
  const runnerFailed = executions.some(
    (execution) => execution.status === 'failed' && execution.kind === 'runner',
  );

  const publicOutcomes = outcomes
    .filter((outcome) => outcome.visibility === 'public')
    .map(({ label, status, message }) => ({ label, status, message }));
  const hiddenOutcomes = outcomes.filter((outcome) => outcome.visibility === 'hidden');
  const passed = outcomes.filter((outcome) => outcome.status === 'passed').length;
  const isScored = input.phase !== 'practice';

  return {
    phase: input.phase,
    publicOutcomes,
    hiddenSummary:
      input.phase === 'practice'
        ? null
        : {
            passed: hiddenOutcomes.filter((outcome) => outcome.status === 'passed').length,
            total: hiddenOutcomes.length,
          },
    scoreGiven: isScored ? calculatePythonScore(passed, outcomes.length) : null,
    scoreMaximum: isScored ? PYTHON_ASSIGNMENT_MAX_SCORE : null,
    runnerFailed,
  };
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<U>,
): Promise<U[]> {
  const results = Array.from<U>({ length: values.length });
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= values.length) return;
        results[index] = await map(values[index]!);
      }
    }),
  );

  return results;
}

export function calculatePythonScore(passed: number, total: number): number {
  if (
    !Number.isInteger(passed) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    passed < 0 ||
    passed > total
  ) {
    throw new PythonAssignmentValidationError('Python test score inputs are invalid.');
  }

  return Math.round((passed / total) * PYTHON_ASSIGNMENT_MAX_SCORE * 100) / 100;
}

function toCodeTestOutcome(
  testCase: EvaluatedCodeTestCase,
  execution: PythonExecutionOutcome,
): CodeTestOutcome {
  if (execution.status === 'failed') {
    return { label: testCase.label, status: 'failed', message: execution.message };
  }

  if (!jsonValuesEqual(execution.value, testCase.expected)) {
    return {
      label: testCase.label,
      status: 'failed',
      message:
        testCase.visibility === 'public'
          ? 'Returned a different value than expected.'
          : 'Hidden test failed.',
    };
  }

  return { label: testCase.label, status: 'passed', message: null };
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]!))
    );
  }

  if (typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) => key === rightKeys[index] && jsonValuesEqual(left[key]!, right[key]!),
      )
    );
  }

  return false;
}
