import { Ajv2020, type ErrorObject, type ValidateFunction } from "@ajv2020";
import type {
  AttemptEventRecord,
  AttemptRecord,
  GradingSettings,
} from "../package_review/types.ts";

interface RawReviewedRubricRule {
  question_id: string;
  correct_answer: string | string[];
  points: number;
}

interface RawReviewedRubric {
  mode: "per-answer";
  max_score: number;
  rules: RawReviewedRubricRule[];
}

export interface ReviewedRubricRule {
  questionId: string;
  correctAnswer: string | string[];
  points: number;
}

export interface ReviewedRubric {
  mode: "per-answer";
  maxScore: number;
  rules: ReviewedRubricRule[];
}

export interface ScoreAttemptInput {
  attempt: AttemptRecord;
  events: AttemptEventRecord[];
  grading: GradingSettings;
  rubric?: ReviewedRubric;
}

export interface AttemptScoreResult {
  scoreGiven: number;
  scoreMaximum: number;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});

const reviewedRubricSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "max_score", "rules"],
  properties: {
    mode: { const: "per-answer" },
    max_score: {
      type: "integer",
      minimum: 0,
    },
    rules: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question_id", "correct_answer", "points"],
        properties: {
          question_id: {
            type: "string",
            minLength: 1,
          },
          correct_answer: {
            anyOf: [
              {
                type: "string",
                minLength: 1,
              },
              {
                type: "array",
                minItems: 1,
                items: {
                  type: "string",
                  minLength: 1,
                },
              },
            ],
          },
          points: {
            type: "integer",
            minimum: 0,
          },
        },
      },
    },
  },
} as const;

const reviewedRubricValidator: ValidateFunction<RawReviewedRubric> = ajv
  .compile<RawReviewedRubric>(reviewedRubricSchema);

export async function loadReviewedRubric(input: {
  snapshotRoot: string;
  rubricFile: string | null;
}): Promise<ReviewedRubric> {
  const snapshotRoot = requireTrimmedString(
    input.snapshotRoot,
    "Reviewed snapshot root is required.",
  );
  const rubricFile = requireTrimmedString(
    input.rubricFile,
    "Declarative grading requires a reviewed rubric file.",
  );
  const rubricPath = joinSnapshotPath(
    snapshotRoot,
    toSnapshotRelativePath(rubricFile),
  );

  assertPathInsideSnapshot(snapshotRoot, rubricPath);

  let sourceText: string;

  try {
    sourceText = await Deno.readTextFile(rubricPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `Reviewed rubric file ${rubricFile} was not found in the pinned snapshot.`,
      );
    }

    throw error;
  }

  let rubricJson: unknown;

  try {
    rubricJson = JSON.parse(sourceText);
  } catch {
    throw new Error(
      `Reviewed rubric file ${rubricFile} must contain valid JSON.`,
    );
  }

  if (!reviewedRubricValidator(rubricJson)) {
    throw new Error(explainReviewedRubricIssues(
      rubricFile,
      reviewedRubricValidator.errors,
    ));
  }

  const rubric = mapReviewedRubric(rubricJson);
  validateReviewedRubricSemantics(rubric, rubricFile);

  return rubric;
}

export function scoreAttempt(input: ScoreAttemptInput): AttemptScoreResult {
  switch (input.grading.mode) {
    case "declarative":
      return scoreDeclarativeAttempt(input);
    case "completion":
      return scoreCompletionAttempt(input);
    case "manual":
      throw new Error(
        "Manual grading cannot be finalized automatically in Phase 3.",
      );
  }
}

function scoreDeclarativeAttempt(
  input: ScoreAttemptInput,
): AttemptScoreResult {
  if (!input.rubric) {
    throw new Error("Declarative grading requires a loaded reviewed rubric.");
  }

  if (input.grading.maxScore === null) {
    throw new Error(
      "Declarative grading requires a reviewed max score before finalize can continue.",
    );
  }

  if (input.grading.maxScore !== input.rubric.maxScore) {
    throw new Error(
      `Reviewed rubric max score ${input.rubric.maxScore} did not match package grading max score ${input.grading.maxScore}.`,
    );
  }

  const validatedEvents = validateAndSortAttemptEvents(
    input.attempt,
    input.events,
  );
  const latestAnswers = new Map<string, string | string[]>();

  for (const record of validatedEvents) {
    if (record.event.type !== "answer") {
      continue;
    }

    latestAnswers.set(record.event.questionId, record.event.answer);
  }

  let scoreGiven = 0;

  for (const rule of input.rubric.rules) {
    const answer = latestAnswers.get(rule.questionId);

    if (answer !== undefined && answersMatch(answer, rule.correctAnswer)) {
      scoreGiven += rule.points;
    }
  }

  return {
    scoreGiven,
    scoreMaximum: input.rubric.maxScore,
  };
}

function scoreCompletionAttempt(
  input: ScoreAttemptInput,
): AttemptScoreResult {
  if (input.grading.maxScore === null) {
    throw new Error(
      "Completion grading requires a reviewed max score before finalize can continue.",
    );
  }

  if (input.attempt.completionState === null) {
    throw new Error(
      "Completion grading requires a finalized completion state.",
    );
  }

  return {
    scoreGiven: input.attempt.completionState === "completed"
      ? input.grading.maxScore
      : 0,
    scoreMaximum: input.grading.maxScore,
  };
}

function validateAndSortAttemptEvents(
  attempt: AttemptRecord,
  events: AttemptEventRecord[],
): AttemptEventRecord[] {
  const sequences = new Set<number>();
  const sortedEvents = [...events].sort((left, right) => {
    return left.sequence - right.sequence;
  });

  for (const record of sortedEvents) {
    if (record.attemptId !== attempt.attemptId) {
      throw new Error(
        `Attempt event ${record.id} does not belong to attempt ${attempt.attemptId}.`,
      );
    }

    if (!Number.isInteger(record.sequence) || record.sequence <= 0) {
      throw new Error(
        `Attempt event ${record.id} must use a positive integer sequence.`,
      );
    }

    if (sequences.has(record.sequence)) {
      throw new Error(
        `Attempt event sequence ${record.sequence} was duplicated for attempt ${attempt.attemptId}.`,
      );
    }

    sequences.add(record.sequence);
    validateAttemptEventRecord(record);
  }

  return sortedEvents;
}

function validateAttemptEventRecord(record: AttemptEventRecord): void {
  const event = record.event as unknown;

  if (!isObject(event)) {
    throw new Error(`Attempt event ${record.id} payload must be an object.`);
  }

  const eventType = event.type;

  if (!isSupportedAttemptEventType(eventType)) {
    throw new Error(
      `Attempt event ${record.id} uses an unsupported event type.`,
    );
  }

  if (record.eventType !== eventType) {
    throw new Error(
      `Attempt event ${record.id} eventType ${record.eventType} did not match payload type ${eventType}.`,
    );
  }

  switch (eventType) {
    case "answer":
      if (
        typeof event.questionId !== "string" || event.questionId.trim() === ""
      ) {
        throw new Error(
          `Attempt event ${record.id} answer is missing a questionId.`,
        );
      }

      if (
        typeof event.answer !== "string" &&
        !isStringArray(event.answer)
      ) {
        throw new Error(
          `Attempt event ${record.id} answer payload must be a string or string array.`,
        );
      }

      requireIsoTimestamp(
        event.timestamp,
        `Attempt event ${record.id} answer timestamp is invalid.`,
      );
      return;
    case "progress":
      if (
        typeof event.checkpoint !== "string" || event.checkpoint.trim() === ""
      ) {
        throw new Error(
          `Attempt event ${record.id} progress checkpoint is required.`,
        );
      }

      if (typeof event.value !== "number" || !Number.isFinite(event.value)) {
        throw new Error(
          `Attempt event ${record.id} progress value must be a finite number.`,
        );
      }

      requireIsoTimestamp(
        event.timestamp,
        `Attempt event ${record.id} progress timestamp is invalid.`,
      );
      return;
    case "complete":
      requireIsoTimestamp(
        event.timestamp,
        `Attempt event ${record.id} completion timestamp is invalid.`,
      );
      return;
  }
}

function explainReviewedRubricIssues(
  rubricFile: string,
  errors: readonly ErrorObject[] | null | undefined,
): string {
  if (!errors || errors.length === 0) {
    return `Reviewed rubric file ${rubricFile} is invalid.`;
  }

  const messages = errors.map((error) => mapReviewedRubricIssue(error));

  return `Reviewed rubric file ${rubricFile} is invalid: ${
    deduplicate(messages).join(" ")
  }`;
}

function mapReviewedRubricIssue(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = String(
      (error.params as Record<string, unknown>).missingProperty ?? "field",
    );
    return `Missing required field ${
      joinJsonPointer(error.instancePath, missingProperty)
    }.`;
  }

  if (error.keyword === "additionalProperties") {
    const property = String(
      (error.params as Record<string, unknown>).additionalProperty ?? "field",
    );
    return `Unsupported field ${property} at ${
      displayInstancePath(error.instancePath)
    }.`;
  }

  if (
    (error.keyword === "const" || error.keyword === "enum") &&
    error.instancePath === "/mode"
  ) {
    return 'Only rubric mode "per-answer" is supported.';
  }

  if (error.keyword === "minItems" && error.instancePath === "/rules") {
    return "At least one scoring rule is required.";
  }

  if (error.keyword === "type") {
    return `${
      displayInstancePath(error.instancePath)
    } has the wrong value type.`;
  }

  if (
    error.keyword === "minimum" &&
    (error.instancePath === "/max_score" ||
      error.instancePath.endsWith("/points"))
  ) {
    return `${
      displayInstancePath(error.instancePath)
    } must be zero or greater.`;
  }

  if (error.keyword === "minLength") {
    return `${displayInstancePath(error.instancePath)} cannot be blank.`;
  }

  return `${
    displayInstancePath(error.instancePath)
  } is not valid for Lantern scoring.`;
}

function validateReviewedRubricSemantics(
  rubric: ReviewedRubric,
  rubricFile: string,
): void {
  const seenQuestionIds = new Set<string>();
  let totalPoints = 0;

  for (const rule of rubric.rules) {
    if (seenQuestionIds.has(rule.questionId)) {
      throw new Error(
        `Reviewed rubric file ${rubricFile} repeats question ${rule.questionId}.`,
      );
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

function mapReviewedRubric(
  rubric: RawReviewedRubric,
): ReviewedRubric {
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

function answersMatch(
  learnerAnswer: string | string[],
  correctAnswer: string | string[],
): boolean {
  if (typeof learnerAnswer === "string" || typeof correctAnswer === "string") {
    return learnerAnswer === correctAnswer;
  }

  if (learnerAnswer.length !== correctAnswer.length) {
    return false;
  }

  const left = [...learnerAnswer].sort();
  const right = [...correctAnswer].sort();

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSupportedAttemptEventType(
  value: unknown,
): value is AttemptEventRecord["eventType"] {
  return value === "answer" || value === "progress" || value === "complete";
}

function requireIsoTimestamp(value: unknown, errorMessage: string): void {
  if (typeof value !== "string") {
    throw new Error(errorMessage);
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(errorMessage);
  }
}

function requireTrimmedString(
  value: string | null,
  errorMessage: string,
): string {
  if (value === null || value.trim() === "") {
    throw new Error(errorMessage);
  }

  return value.trim();
}

function toSnapshotRelativePath(path: string): string {
  const normalizedPath = normalizeFilePath(path);

  if (!normalizedPath.startsWith("/")) {
    throw new Error("Reviewed rubric path must be an absolute package path.");
  }

  return normalizedPath.slice(1);
}

function joinSnapshotPath(snapshotRoot: string, relativePath: string): string {
  const root = normalizeFilePath(snapshotRoot);
  const relative = normalizeFilePath(relativePath);

  return relative === "" ? root : `${root}/${relative}`;
}

function assertPathInsideSnapshot(
  snapshotRoot: string,
  targetPath: string,
): void {
  const normalizedRoot = normalizeFilePath(snapshotRoot);
  const normalizedTarget = normalizeFilePath(targetPath);

  if (
    normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error("Reviewed rubric file is outside the pinned snapshot.");
  }
}

function normalizeFilePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(
          "Reviewed rubric file must stay inside the pinned snapshot.",
        );
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return `${isAbsolute ? "/" : ""}${segments.join("/")}`;
}

function joinJsonPointer(instancePath: string, property: string): string {
  if (instancePath === "") {
    return `/${property}`;
  }

  return `${instancePath}/${property}`;
}

function displayInstancePath(instancePath: string): string {
  return instancePath === "" ? "Rubric" : instancePath;
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values)];
}
