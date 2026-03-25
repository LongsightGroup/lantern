import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord, nextId } from './package_review_in_memory_shared.ts';

type AttemptRepository = Pick<
  PackageReviewRepository,
  | 'createAttempt'
  | 'getAttemptById'
  | 'appendAttemptEvent'
  | 'listAttemptEvents'
  | 'finalizeAttempt'
  | 'getLineItemBinding'
  | 'saveLineItemBinding'
  | 'getGradePublicationByAttemptId'
  | 'createGradePublication'
  | 'updateGradePublication'
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

    appendAttemptEvent(input) {
      const attempt = state.attempts.find((candidate) => candidate.attemptId === input.attemptId);

      if (!attempt) {
        throw new Error(`Attempt ${input.attemptId} was not found.`);
      }

      const sequence =
        state.attemptEvents
          .filter((candidate) => candidate.attemptId === input.attemptId)
          .reduce((max, candidate) => Math.max(max, candidate.sequence), 0) + 1;
      const nextRecord = cloneRecord({
        id: nextId(state.attemptEvents),
        attemptId: input.attemptId,
        sequence,
        eventType: input.event.type,
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

    getLineItemBinding(input) {
      const record = state.lineItemBindings.find(
        (candidate) =>
          candidate.deploymentRecordId === input.deploymentRecordId &&
          candidate.packageVersionId === input.packageVersionId &&
          candidate.contextId === input.contextId &&
          candidate.resourceLinkId === input.resourceLinkId &&
          candidate.activityId === input.activityId,
      );

      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    saveLineItemBinding(record) {
      const existing = state.lineItemBindings.find(
        (candidate) =>
          candidate.deploymentRecordId === record.deploymentRecordId &&
          candidate.packageVersionId === record.packageVersionId &&
          candidate.contextId === record.contextId &&
          candidate.resourceLinkId === record.resourceLinkId &&
          candidate.activityId === record.activityId,
      );

      if (existing) {
        return Promise.resolve(cloneRecord(existing));
      }

      const nextRecord = cloneRecord({
        ...record,
        id: nextId(state.lineItemBindings),
      });
      state.lineItemBindings.push(nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    getGradePublicationByAttemptId(attemptId) {
      const record = state.gradePublications.find((candidate) => candidate.attemptId === attemptId);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    createGradePublication(record) {
      const existing = state.gradePublications.find(
        (candidate) => candidate.attemptId === record.attemptId,
      );

      if (existing) {
        return Promise.resolve(cloneRecord(existing));
      }

      const nextRecord = cloneRecord({
        ...record,
        id: nextId(state.gradePublications),
      });
      state.gradePublications.push(nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    updateGradePublication(input) {
      const index = state.gradePublications.findIndex(
        (candidate) => candidate.attemptId === input.attemptId,
      );

      if (index < 0) {
        throw new Error(`Grade publication for attempt ${input.attemptId} was not found.`);
      }

      const existing = state.gradePublications[index];

      if (!existing) {
        throw new Error(`Grade publication for attempt ${input.attemptId} was not found.`);
      }

      const nextRecord = cloneRecord({
        ...existing,
        status: input.status,
        updatedAt: input.updatedAt,
        publishedAt: input.publishedAt,
        errorCode: input.errorCode,
        errorDetail: input.errorDetail,
      });
      state.gradePublications.splice(index, 1, nextRecord);
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
