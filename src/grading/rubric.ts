import { Ajv2020, type ErrorObject, type ValidateFunction } from '@ajv2020';
import {
  assertPathInsideSnapshot,
  joinSnapshotPath,
  normalizeSnapshotPath,
} from '../package_review/snapshot_path.ts';
import type { RawReviewedRubric, ReviewedRubric } from './types.ts';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});

const reviewedRubricSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'max_score', 'rules'],
  properties: {
    mode: { const: 'per-answer' },
    max_score: {
      type: 'integer',
      minimum: 0,
    },
    rules: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question_id', 'correct_answer', 'points'],
        properties: {
          question_id: {
            type: 'string',
            minLength: 1,
          },
          correct_answer: {
            anyOf: [
              {
                type: 'string',
                minLength: 1,
              },
              {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'string',
                  minLength: 1,
                },
              },
            ],
          },
          points: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
    },
  },
} as const;

const reviewedRubricValidator: ValidateFunction<RawReviewedRubric> =
  ajv.compile<RawReviewedRubric>(reviewedRubricSchema);

export async function loadReviewedRubric(input: {
  snapshotRoot: string;
  rubricFile: string | null;
}): Promise<ReviewedRubric> {
  const snapshotRoot = requireTrimmedString(
    input.snapshotRoot,
    'Reviewed snapshot root is required.',
  );
  const rubricFile = requireTrimmedString(
    input.rubricFile,
    'Declarative grading requires a reviewed rubric file.',
  );
  const rubricPath = joinSnapshotPath(
    snapshotRoot,
    toSnapshotRelativePath(rubricFile),
    'Reviewed rubric file must stay inside the pinned snapshot.',
  );

  assertPathInsideSnapshot(
    snapshotRoot,
    rubricPath,
    'Reviewed rubric file is outside the pinned snapshot.',
  );

  let sourceText: string;

  try {
    sourceText = await Deno.readTextFile(rubricPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new TypeError(
        `Reviewed rubric file ${rubricFile} was not found in the pinned snapshot.`,
      );
    }

    throw error;
  }

  let rubricJson: unknown;

  try {
    rubricJson = JSON.parse(sourceText);
  } catch {
    throw new Error(`Reviewed rubric file ${rubricFile} must contain valid JSON.`);
  }

  if (!reviewedRubricValidator(rubricJson)) {
    throw new Error(explainReviewedRubricIssues(rubricFile, reviewedRubricValidator.errors));
  }

  const rubric = mapReviewedRubric(rubricJson);
  validateReviewedRubricSemantics(rubric, rubricFile);

  return rubric;
}

function explainReviewedRubricIssues(
  rubricFile: string,
  errors: readonly ErrorObject[] | null | undefined,
): string {
  if (!errors || errors.length === 0) {
    return `Reviewed rubric file ${rubricFile} is invalid.`;
  }

  const messages = errors.map((error) => mapReviewedRubricIssue(error));

  return `Reviewed rubric file ${rubricFile} is invalid: ${deduplicate(messages).join(' ')}`;
}

function mapReviewedRubricIssue(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const missingProperty = String(
      (error.params as Record<string, unknown>).missingProperty ?? 'field',
    );
    return `Missing required field ${joinJsonPointer(error.instancePath, missingProperty)}.`;
  }

  if (error.keyword === 'additionalProperties') {
    const property = String(
      (error.params as Record<string, unknown>).additionalProperty ?? 'field',
    );
    return `Unsupported field ${property} at ${displayInstancePath(error.instancePath)}.`;
  }

  if ((error.keyword === 'const' || error.keyword === 'enum') && error.instancePath === '/mode') {
    return 'Only rubric mode "per-answer" is supported.';
  }

  if (error.keyword === 'minItems' && error.instancePath === '/rules') {
    return 'At least one scoring rule is required.';
  }

  if (error.keyword === 'type') {
    return `${displayInstancePath(error.instancePath)} has the wrong value type.`;
  }

  if (
    error.keyword === 'minimum' &&
    (error.instancePath === '/max_score' || error.instancePath.endsWith('/points'))
  ) {
    return `${displayInstancePath(error.instancePath)} must be zero or greater.`;
  }

  if (error.keyword === 'minLength') {
    return `${displayInstancePath(error.instancePath)} cannot be blank.`;
  }

  return `${displayInstancePath(error.instancePath)} is not valid for Lantern scoring.`;
}

function validateReviewedRubricSemantics(rubric: ReviewedRubric, rubricFile: string): void {
  const seenQuestionIds = new Set<string>();
  let totalPoints = 0;

  for (const rule of rubric.rules) {
    if (seenQuestionIds.has(rule.questionId)) {
      throw new Error(`Reviewed rubric file ${rubricFile} repeats question ${rule.questionId}.`);
    }

    seenQuestionIds.add(rule.questionId);
    totalPoints += rule.points;
  }

  if (totalPoints !== rubric.maxScore) {
    throw new Error(
      `Reviewed rubric file ${rubricFile} total rule points ${totalPoints} did not match max_score ${rubric.maxScore}.`,
    );
  }
}

function mapReviewedRubric(rubric: RawReviewedRubric): ReviewedRubric {
  return {
    mode: rubric.mode,
    maxScore: rubric.max_score,
    rules: rubric.rules.map((rule) => ({
      questionId: rule.question_id,
      correctAnswer: rule.correct_answer,
      points: rule.points,
    })),
  };
}

function requireTrimmedString(value: string | null, errorMessage: string): string {
  if (value === null || value.trim() === '') {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function toSnapshotRelativePath(path: string): string {
  const normalizedPath = normalizeSnapshotPath(
    path,
    'Reviewed rubric file must stay inside the pinned snapshot.',
  );

  if (!normalizedPath.startsWith('/')) {
    throw new Error('Reviewed rubric path must be an absolute package path.');
  }

  return normalizedPath.slice(1);
}

function joinJsonPointer(instancePath: string, property: string): string {
  if (instancePath === '') {
    return `/${property}`;
  }

  return `${instancePath}/${property}`;
}

function displayInstancePath(instancePath: string): string {
  return instancePath === '' ? 'Rubric' : instancePath;
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values)];
}
