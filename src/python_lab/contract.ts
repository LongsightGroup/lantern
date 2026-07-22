export const PYTHON_ASSIGNMENT_MAX_SCORE = 10;
export const PYTHON_PUBLIC_CASE_COUNT = 3;
export const PYTHON_HIDDEN_CASE_COUNT = 5;
export const PYTHON_TOTAL_CASE_COUNT = PYTHON_PUBLIC_CASE_COUNT + PYTHON_HIDDEN_CASE_COUNT;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export type CodeTestVisibility = 'public' | 'hidden';

export interface PythonFunctionContract {
  readonly functionName: string;
  readonly maxScore: typeof PYTHON_ASSIGNMENT_MAX_SCORE;
}

export interface GeneratedCodeTestInput {
  readonly label: string;
  readonly visibility: CodeTestVisibility;
  readonly args: JsonValue[];
}

export interface EvaluatedCodeTestCase extends GeneratedCodeTestInput {
  readonly expected: JsonValue;
}

export interface PythonAssignmentDraft {
  readonly title: string;
  readonly prompt: string;
  readonly starterCode: string;
  readonly referenceCode: string;
  readonly contract: PythonFunctionContract;
}

export interface PythonAssignmentPublicDraft {
  readonly title: string;
  readonly prompt: string;
  readonly starterCode: string;
  readonly contract: PythonFunctionContract;
}

export interface PublicPythonAssignmentContent {
  readonly title: string;
  readonly prompt: string;
  readonly starterCode: string;
  readonly functionName: string;
  readonly publicCases: ReadonlyArray<{
    readonly label: string;
    readonly args: JsonValue[];
    readonly expected: JsonValue;
  }>;
  readonly scoreMaximum: typeof PYTHON_ASSIGNMENT_MAX_SCORE;
}

export class PythonContractError extends Error {
  readonly _tag = 'PythonContractError' as const;

  constructor(message: string) {
    super(message);
  }
}

export function parsePythonAssignmentDraft(input: unknown): PythonAssignmentDraft {
  const record = requireRecord(input, 'Python assignment draft must be an object.');
  return {
    ...parsePythonAssignmentPublicDraft(record),
    referenceCode: requireBoundedText(record.referenceCode, 'Reference solution', 32_000),
  };
}

export function parsePythonAssignmentPublicDraft(input: unknown): PythonAssignmentPublicDraft {
  const record = requireRecord(input, 'Python assignment draft must be an object.');
  const functionName = parsePythonFunctionName(record.functionName);

  return {
    title: requireBoundedText(record.title, 'Assignment title', 160),
    prompt: requireBoundedText(record.prompt, 'Assignment prompt', 12_000),
    starterCode: requireBoundedText(record.starterCode, 'Starter code', 32_000),
    contract: {
      functionName,
      maxScore: PYTHON_ASSIGNMENT_MAX_SCORE,
    },
  };
}

export function combinePythonAssignmentDraft(input: {
  readonly publicDraft: PythonAssignmentPublicDraft;
  readonly referenceCode: unknown;
}): PythonAssignmentDraft {
  return {
    ...input.publicDraft,
    referenceCode: requireBoundedText(input.referenceCode, 'Reference solution', 32_000),
  };
}

export function parsePythonFunctionName(input: unknown): string {
  if (typeof input !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(input)) {
    throw new PythonContractError(
      'Function name must be a valid Python identifier with at most 80 characters.',
    );
  }

  return input;
}

export function parseGeneratedCodeTestInputs(input: unknown): GeneratedCodeTestInput[] {
  const record = requireRecord(input, 'Generated test data must be an object.');
  const cases = record.cases;

  if (!Array.isArray(cases) || cases.length !== PYTHON_TOTAL_CASE_COUNT) {
    throw new PythonContractError(
      `Generated test data must include exactly ${PYTHON_TOTAL_CASE_COUNT} cases.`,
    );
  }

  const parsed = cases.map((item, index) => parseGeneratedCodeTestInput(item, index));
  const publicCases = parsed.filter((item) => item.visibility === 'public');
  const hiddenCases = parsed.filter((item) => item.visibility === 'hidden');

  if (
    publicCases.length !== PYTHON_PUBLIC_CASE_COUNT ||
    hiddenCases.length !== PYTHON_HIDDEN_CASE_COUNT
  ) {
    throw new PythonContractError(
      `Generated test data must include ${PYTHON_PUBLIC_CASE_COUNT} public and ${PYTHON_HIDDEN_CASE_COUNT} hidden cases.`,
    );
  }

  const labels = new Set<string>();

  for (const testCase of parsed) {
    if (labels.has(testCase.label)) {
      throw new PythonContractError('Generated test case labels must be unique.');
    }
    labels.add(testCase.label);
  }

  return parsed;
}

export function parseJsonValue(input: unknown, field = 'Value'): JsonValue {
  if (
    input === null || typeof input === 'string' || typeof input === 'boolean' ||
    (typeof input === 'number' && Number.isFinite(input))
  ) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => parseJsonValue(item, field));
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};

    for (const [key, value] of Object.entries(record)) {
      result[key] = parseJsonValue(value, field);
    }

    return result;
  }

  throw new PythonContractError(`${field} must be JSON-compatible.`);
}

export function buildPublicPythonAssignmentContent(input: {
  readonly draft: PythonAssignmentDraft;
  readonly cases: readonly EvaluatedCodeTestCase[];
}): PublicPythonAssignmentContent {
  const publicCases = input.cases.filter((testCase) => testCase.visibility === 'public').map(
    (testCase) => ({
      label: testCase.label,
      args: testCase.args,
      expected: testCase.expected,
    }),
  );

  if (publicCases.length !== PYTHON_PUBLIC_CASE_COUNT) {
    throw new PythonContractError('A Python assignment requires exactly three public cases.');
  }

  return {
    title: input.draft.title,
    prompt: input.draft.prompt,
    starterCode: input.draft.starterCode,
    functionName: input.draft.contract.functionName,
    publicCases,
    scoreMaximum: PYTHON_ASSIGNMENT_MAX_SCORE,
  };
}

function parseGeneratedCodeTestInput(input: unknown, index: number): GeneratedCodeTestInput {
  const record = requireRecord(input, `Generated test case ${index + 1} must be an object.`);
  const visibility = record.visibility;

  if (visibility !== 'public' && visibility !== 'hidden') {
    throw new PythonContractError(
      `Generated test case ${index + 1} must have visibility public or hidden.`,
    );
  }

  const args = record.args;

  if (!Array.isArray(args)) {
    throw new PythonContractError(`Generated test case ${index + 1} args must be a JSON array.`);
  }

  return {
    label: requireBoundedText(record.label, `Generated test case ${index + 1} label`, 120),
    visibility,
    args: args.map((value) => parseJsonValue(value, `Generated test case ${index + 1} args`)),
  };
}

function requireRecord(input: unknown, message: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new PythonContractError(message);
  }

  return input as Record<string, unknown>;
}

function requireBoundedText(input: unknown, label: string, maximumLength: number): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new PythonContractError(`${label} is required.`);
  }

  if (input.length > maximumLength) {
    throw new PythonContractError(`${label} must contain at most ${maximumLength} characters.`);
  }

  return input;
}
