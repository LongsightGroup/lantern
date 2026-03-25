import type { AttemptEvent, Capability } from '../../sdk/app-sdk.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { FinalizeAttemptInput } from './gateway_types.ts';

export function parseAttemptEvent(payload: unknown): AttemptEvent {
  const record = requireRecord(payload, 'Attempt event payload must be an object.');
  const type = requireString(record.type, 'Attempt event type is required.');

  switch (type) {
    case 'answer':
      return {
        type,
        questionId: requireString(record.questionId, 'Attempt answer questionId is required.'),
        answer: requireAnswerValue(record.answer),
        timestamp: requireTimestamp(record.timestamp, 'Attempt answer timestamp is required.'),
      };
    case 'progress':
      return {
        type,
        checkpoint: requireString(record.checkpoint, 'Attempt progress checkpoint is required.'),
        value: requireNumber(record.value, 'Attempt progress value is required.'),
        timestamp: requireTimestamp(record.timestamp, 'Attempt progress timestamp is required.'),
      };
    case 'complete':
      return {
        type,
        timestamp: requireTimestamp(record.timestamp, 'Attempt complete timestamp is required.'),
      };
    default:
      throw new Error(`Unsupported attempt event type ${type}.`);
  }
}

export function parseFinalizeAttemptInput(payload: unknown): FinalizeAttemptInput {
  if (payload === null || payload === undefined) {
    return { completionState: 'completed' };
  }

  const record = requireRecord(payload, 'Finalize payload must be an object when provided.');
  const completionState = record.completionState;

  if (completionState === undefined) {
    return { completionState: 'completed' };
  }

  if (completionState !== 'completed' && completionState !== 'abandoned') {
    throw new Error('Finalize completionState must be completed or abandoned.');
  }

  return { completionState };
}

export function requireRuntimeCapability(
  session: RuntimeSessionRecord,
  capability: Capability,
): void {
  if (!session.capabilities.includes(capability)) {
    throw new Error(`Runtime session does not allow ${capability}.`);
  }
}

function requireRecord(payload: unknown, message: string): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }

  return value.trim();
}

function requireAnswerValue(value: unknown): string | string[] {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  if (Array.isArray(value)) {
    const answers = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );

    if (answers.length > 0) {
      return answers;
    }
  }

  throw new Error('Attempt answer value is required.');
}

function requireNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(message);
  }

  return value;
}

function requireTimestamp(value: unknown, message: string): string {
  const timestamp = requireString(value, message);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(message);
  }

  return timestamp;
}
