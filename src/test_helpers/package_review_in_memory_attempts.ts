import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord, nextId } from './package_review_in_memory_shared.ts';

type AttemptRepository = Pick<
  PackageReviewRepository,
  | 'createAttempt'
  | 'getAttemptById'
  | 'listAttemptsByApp'
  | 'createAttemptEvidenceArtifact'
  | 'getAttemptEvidenceArtifactById'
  | 'listAttemptEvidenceArtifacts'
  | 'appendAttemptEvent'
  | 'listAttemptEvents'
  | 'finalizeAttempt'
  | 'writeAttemptLocalState'
  | 'recordAuditEvent'
  | 'listAuditEventsByAttemptId'
  | 'listAuditEventsByEventType'
>;

export function createInMemoryAttemptRepository(state: InMemoryRepositoryState): AttemptRepository {
  return {
    createAttempt(record) {
      const existing = state.attempts.find((candidate) => candidate.attemptId === record.attemptId);

      if (existing) {
        throw new Error(`Attempt ${record.attemptId} already exists and cannot be replaced.`);
      }

      const nextRecord = cloneRecord({ ...record, id: nextId(state.attempts) });
      state.attempts.push(nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    getAttemptById(attemptId) {
      const record = state.attempts.find((candidate) => candidate.attemptId === attemptId);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    listAttemptsByApp(appId) {
      return Promise.resolve(
        state.attempts
          .filter((candidate) => candidate.appId === appId)
          .sort(
            (left, right) => right.startedAt.localeCompare(left.startedAt) || right.id - left.id,
          )
          .map(cloneRecord),
      );
    },

    createAttemptEvidenceArtifact(input) {
      const attempt = state.attempts.find((candidate) => candidate.attemptId === input.attemptId);

      if (!attempt) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const existing = state.attemptEvidenceArtifacts.find(
        (candidate) => candidate.artifactId === input.artifactId,
      );

      if (existing) {
        throw new Error(
          `Attempt evidence artifact ${input.artifactId} already exists and cannot be replaced.`,
        );
      }

      const sequence = state.attemptEvidenceArtifacts
        .filter((candidate) => candidate.attemptId === input.attemptId)
        .reduce((max, candidate) => Math.max(max, candidate.sequence), 0) + 1;
      const nextRecord = cloneRecord({
        ...input,
        sequence,
      });
      state.attemptEvidenceArtifacts.push(nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    getAttemptEvidenceArtifactById(artifactId) {
      const record = state.attemptEvidenceArtifacts.find(
        (candidate) => candidate.artifactId === artifactId,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    listAttemptEvidenceArtifacts(attemptId) {
      return Promise.resolve(
        state.attemptEvidenceArtifacts
          .filter((candidate) => candidate.attemptId === attemptId)
          .sort((left, right) => left.sequence - right.sequence)
          .map(cloneRecord),
      );
    },

    writeAttemptLocalState(input) {
      const index = state.attempts.findIndex(
        (candidate) => candidate.attemptId === input.attemptId,
      );

      if (index < 0) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const existing = state.attempts[index];

      if (!existing) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const nextRecord = cloneRecord({
        ...existing,
        localState: input.localState,
      });
      state.attempts.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    appendAttemptEvent(input) {
      const attempt = state.attempts.find((candidate) => candidate.attemptId === input.attemptId);

      if (!attempt) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const sequence = state.attemptEvents
        .filter((candidate) => candidate.attemptId === input.attemptId)
        .reduce((max, candidate) => Math.max(max, candidate.sequence), 0) + 1;
      const nextRecord = cloneRecord({
        id: nextId(state.attemptEvents),
        attemptId: input.attemptId,
        sequence,
        eventType: input.event.type,
        learningVerb: input.normalizedEvent.learningVerb,
        objectId: input.normalizedEvent.objectId,
        objectType: input.normalizedEvent.objectType,
        result: input.normalizedEvent.result,
        event: input.event,
        receivedAt: input.receivedAt,
      });

      state.attemptEvents.push(nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    listAttemptEvents(attemptId) {
      return Promise.resolve(
        state.attemptEvents
          .filter((candidate) => candidate.attemptId === attemptId)
          .map(cloneRecord),
      );
    },

    finalizeAttempt(input) {
      const index = state.attempts.findIndex(
        (candidate) => candidate.attemptId === input.attemptId,
      );

      if (index < 0) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const existing = state.attempts[index];

      if (!existing) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      if (existing.finalizedAt !== null) {
        return Promise.resolve(cloneRecord(existing));
      }

      const nextRecord = cloneRecord({
        ...existing,
        status: input.status,
        completionState: input.completionState,
        finalizedAt: input.finalizedAt,
      });
      state.attempts.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    recordAuditEvent(record) {
      const nextRecord = cloneRecord({
        ...record,
        id: nextId(state.auditEvents),
      });
      state.auditEvents.push(nextRecord);

      return Promise.resolve(cloneRecord(nextRecord));
    },

    listAuditEventsByAttemptId(attemptId) {
      return Promise.resolve(
        state.auditEvents.filter((candidate) => candidate.attemptId === attemptId).map(cloneRecord),
      );
    },

    listAuditEventsByEventType(eventType) {
      return Promise.resolve(
        state.auditEvents.filter((candidate) => candidate.eventType === eventType).map(cloneRecord),
      );
    },
  };
}
