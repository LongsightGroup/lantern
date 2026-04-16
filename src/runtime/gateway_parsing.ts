import type {
  AttemptEvent,
  BrowserGraderResult,
  BrowserGraderSpecResult,
  Capability,
  EvidenceArtifactContentType,
  EvidenceArtifactKind,
  ScoreProposal,
} from '../../sdk/app-sdk.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { AttemptLocalState } from '../package_review/types.ts';
import { denyRuntimeBroker, errorMessage, isRuntimeBrokerDenialError } from './gateway_errors.ts';
import type { FinalizeAttemptInput, ParsedEvidenceArtifactUpload } from './gateway_types.ts';

export function parseAttemptEvent(payload: unknown): AttemptEvent {
  try {
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
        denyRuntimeBroker({
          category: 'specInvalid',
          code: 'unsupported_attempt_event',
          message: `Unsupported attempt event type ${type}.`,
          capability: 'submit_attempt_event',
          detail: {
            attemptEventType: type,
          },
        });
    }
  } catch (error) {
    if (isRuntimeBrokerDenialError(error)) {
      throw error;
    }

    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_attempt_event',
      message: errorMessage(error),
      capability: 'submit_attempt_event',
      detail: {},
    });
  }
}

export function parseFinalizeAttemptInput(payload: unknown): FinalizeAttemptInput {
  try {
    if (payload === null || payload === undefined) {
      return {
        completionState: 'completed',
        browserGraderResult: null,
      };
    }

    const record = requireRecord(payload, 'Finalize payload must be an object when provided.');
    const completionState = record.completionState;

    if (completionState === undefined) {
      return {
        completionState: 'completed',
        browserGraderResult: parseOptionalBrowserGraderResult(record.browserGraderResult),
      };
    }

    if (completionState !== 'completed' && completionState !== 'abandoned') {
      throw new Error('Finalize completionState must be completed or abandoned.');
    }

    return {
      completionState,
      browserGraderResult: parseOptionalBrowserGraderResult(record.browserGraderResult),
    };
  } catch (error) {
    if (isRuntimeBrokerDenialError(error)) {
      throw error;
    }

    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_finalize_request',
      message: errorMessage(error),
      capability: 'finalize_attempt',
      detail: {},
    });
  }
}

export function parseBrowserGraderResult(payload: unknown): BrowserGraderResult {
  const record = requireRecord(payload, 'Browser grader result must be an object.');
  const scoreGiven = requireNumber(
    record.scoreGiven,
    'Browser grader result scoreGiven is required.',
  );
  const scoreMaximum = requireNumber(
    record.scoreMaximum,
    'Browser grader result scoreMaximum is required.',
  );

  if (scoreMaximum <= 0) {
    throw new Error('Browser grader result scoreMaximum must be greater than zero.');
  }

  if (scoreGiven < 0 || scoreGiven > scoreMaximum) {
    throw new Error('Browser grader result scoreGiven must stay between zero and scoreMaximum.');
  }

  const specResults = requireSpecResults(record.specResults);

  if (specResults.length === 0) {
    throw new Error('Browser grader result must include at least one reviewed spec result.');
  }

  return {
    scoreGiven,
    scoreMaximum,
    specResults,
  };
}

export function requireRuntimeCapability(
  session: RuntimeSessionRecord,
  capability: Capability,
): void {
  if (!session.capabilities.includes(capability)) {
    denyRuntimeBroker({
      category: 'policyDenied',
      code: 'capability_not_granted',
      message: `Runtime session does not allow ${capability}.`,
      capability,
      detail: {
        sessionId: session.sessionId,
        attemptId: session.attemptId,
      },
    });
  }
}

export function parseAttemptLocalState(payload: unknown): AttemptLocalState {
  try {
    if (payload === null) {
      return null;
    }

    return requireRecord(payload, 'Attempt local state must be a JSON object or null.');
  } catch (error) {
    if (isRuntimeBrokerDenialError(error)) {
      throw error;
    }

    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_local_state',
      message: errorMessage(error),
      capability: 'write_local_state',
      detail: {},
    });
  }
}

export function parseScoreProposal(payload: unknown): ScoreProposal {
  try {
    const record = requireRecord(payload, 'Score proposal payload must be an object.');
    const scoreGiven = requireNumber(record.scoreGiven, 'Score proposal scoreGiven is required.');
    const scoreMaximum = requireNumber(
      record.scoreMaximum,
      'Score proposal scoreMaximum is required.',
    );

    if (scoreMaximum <= 0) {
      throw new Error('Score proposal scoreMaximum must be greater than zero.');
    }

    if (scoreGiven < 0 || scoreGiven > scoreMaximum) {
      throw new Error('Score proposal scoreGiven must stay between zero and scoreMaximum.');
    }

    return {
      scoreGiven,
      scoreMaximum,
    };
  } catch (error) {
    if (isRuntimeBrokerDenialError(error)) {
      throw error;
    }

    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_score_proposal',
      message: errorMessage(error),
      capability: 'finalize_attempt',
      detail: {},
    });
  }
}

export function parseEvidenceArtifactUpload(payload: unknown): ParsedEvidenceArtifactUpload {
  try {
    const record = requireRecord(payload, 'Evidence artifact payload must be an object.');
    const kind = requireEvidenceArtifactKind(record.kind);
    const contentType = requireEvidenceArtifactContentType(record.contentType);

    if (!isAllowedEvidenceArtifactPair(kind, contentType)) {
      throw new Error('Evidence artifact kind and contentType must use a supported pair.');
    }

    const fileName = requireString(record.fileName, 'Evidence artifact fileName is required.');
    const bodyBase64 = requireString(
      record.bodyBase64,
      'Evidence artifact bodyBase64 is required.',
    );
    const body = decodeBase64(bodyBase64);

    if (body.byteLength === 0) {
      throw new Error('Evidence artifact bodyBase64 must decode to non-empty bytes.');
    }

    return {
      kind,
      contentType,
      fileName,
      body,
    };
  } catch (error) {
    if (isRuntimeBrokerDenialError(error)) {
      throw error;
    }

    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_evidence_artifact',
      message: errorMessage(error),
      capability: 'submit_evidence_artifact',
      detail: {},
    });
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

function parseOptionalBrowserGraderResult(value: unknown): BrowserGraderResult | null {
  if (value === undefined) {
    return null;
  }

  return parseBrowserGraderResult(value);
}

function requireSpecResults(value: unknown): BrowserGraderSpecResult[] {
  if (!Array.isArray(value)) {
    throw new Error('Browser grader result specResults must be an array.');
  }

  return value.map((candidate, index) => parseSpecResult(candidate, index));
}

function requireEvidenceArtifactKind(value: unknown): EvidenceArtifactKind {
  if (value === 'screenshot_png' || value === 'structured_json') {
    return value;
  }

  throw new Error('Evidence artifact kind must use a supported value.');
}

function requireEvidenceArtifactContentType(value: unknown): EvidenceArtifactContentType {
  if (value === 'image/png' || value === 'application/json') {
    return value;
  }

  throw new Error('Evidence artifact contentType must use a supported value.');
}

function isAllowedEvidenceArtifactPair(
  kind: EvidenceArtifactKind,
  contentType: EvidenceArtifactContentType,
): boolean {
  return (
    (kind === 'screenshot_png' && contentType === 'image/png') ||
    (kind === 'structured_json' && contentType === 'application/json')
  );
}

function decodeBase64(value: string): Uint8Array {
  try {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);

    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }

    return bytes;
  } catch {
    throw new Error('Evidence artifact bodyBase64 must be valid base64.');
  }
}

function parseSpecResult(value: unknown, index: number): BrowserGraderSpecResult {
  const record = requireRecord(value, `Browser grader spec result ${index + 1} must be an object.`);
  const source = requireString(
    record.source,
    `Browser grader spec result ${index + 1} source is required.`,
  );
  const result = requireString(
    record.result,
    `Browser grader spec result ${index + 1} result is required.`,
  );

  if (result !== 'passed' && result !== 'failed') {
    throw new Error(`Browser grader spec result ${index + 1} result must be passed or failed.`);
  }

  return {
    source,
    result,
    failures: requireFailureMessages(record.failures, index),
  };
}

function requireFailureMessages(value: unknown, index: number): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Browser grader spec result ${index + 1} failures must be an array.`);
  }

  return value.map((candidate, failureIndex) =>
    requireString(
      candidate,
      `Browser grader spec result ${index + 1} failure ${failureIndex + 1} must be a string.`,
    ),
  );
}
