import type { AttemptEventRecord, AttemptRecord } from '../package_review/types.ts';
import type { AttemptScoreResult, ScoreAttemptInput } from './types.ts';

export function scoreAttempt(input: ScoreAttemptInput): AttemptScoreResult {
  switch (input.grading.mode) {
    case 'declarative':
      return scoreDeclarativeAttempt(input);
    case 'completion':
      return scoreCompletionAttempt(input);
    case 'browser':
      throw new Error(
        'Browser grading must be finalized through the reviewed runtime browser grader result.',
      );
    case 'manual':
      throw new Error('Manual grading cannot be finalized automatically in Phase 3.');
  }
}

function scoreDeclarativeAttempt(input: ScoreAttemptInput): AttemptScoreResult {
  if (!input.rubric) {
    throw new Error('Declarative grading requires a loaded reviewed rubric.');
  }

  if (input.grading.maxScore === null) {
    throw new Error(
      'Declarative grading requires a reviewed max score before finalize can continue.',
    );
  }

  if (input.grading.maxScore !== input.rubric.maxScore) {
    throw new Error(
      `Reviewed rubric max score ${input.rubric.maxScore} did not match package grading max score ${input.grading.maxScore}.`,
    );
  }

  const validatedEvents = validateAndSortAttemptEvents(input.attempt, input.events);
  const latestAnswers = new Map<string, string | string[]>();

  for (const record of validatedEvents) {
    if (record.event.type !== 'answer') {
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

function scoreCompletionAttempt(input: ScoreAttemptInput): AttemptScoreResult {
  if (input.grading.maxScore === null) {
    throw new Error(
      'Completion grading requires a reviewed max score before finalize can continue.',
    );
  }

  if (input.attempt.completionState === null) {
    throw new Error('Completion grading requires a finalized completion state.');
  }

  return {
    scoreGiven: input.attempt.completionState === 'completed' ? input.grading.maxScore : 0,
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
      throw new Error(`Attempt event ${record.id} must use a positive integer sequence.`);
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
    throw new Error(`Attempt event ${record.id} uses an unsupported event type.`);
  }

  if (record.eventType !== eventType) {
    throw new Error(
      `Attempt event ${record.id} eventType ${record.eventType} did not match payload type ${eventType}.`,
    );
  }

  switch (eventType) {
    case 'answer':
      if (typeof event.questionId !== 'string' || event.questionId.trim() === '') {
        throw new Error(`Attempt event ${record.id} answer is missing a questionId.`);
      }

      if (typeof event.answer !== 'string' && !isStringArray(event.answer)) {
        throw new Error(
          `Attempt event ${record.id} answer payload must be a string or string array.`,
        );
      }

      requireIsoTimestamp(
        event.timestamp,
        `Attempt event ${record.id} answer timestamp is invalid.`,
      );
      return;
    case 'progress':
      if (typeof event.checkpoint !== 'string' || event.checkpoint.trim() === '') {
        throw new Error(`Attempt event ${record.id} progress checkpoint is required.`);
      }

      if (typeof event.value !== 'number' || !Number.isFinite(event.value)) {
        throw new TypeError(`Attempt event ${record.id} progress value must be a finite number.`);
      }

      requireIsoTimestamp(
        event.timestamp,
        `Attempt event ${record.id} progress timestamp is invalid.`,
      );
      return;
    case 'complete':
      requireIsoTimestamp(
        event.timestamp,
        `Attempt event ${record.id} completion timestamp is invalid.`,
      );
      return;
  }
}

function answersMatch(learnerAnswer: string | string[], correctAnswer: string | string[]): boolean {
  if (typeof learnerAnswer === 'string' || typeof correctAnswer === 'string') {
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
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSupportedAttemptEventType(value: unknown): value is AttemptEventRecord['eventType'] {
  return value === 'answer' || value === 'progress' || value === 'complete';
}

function requireIsoTimestamp(value: unknown, errorMessage: string): void {
  if (typeof value !== 'string') {
    throw new TypeError(errorMessage);
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(errorMessage);
  }
}
