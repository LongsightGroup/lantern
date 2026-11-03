import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { InMemoryRepositoryState } from './package_review_in_memory_shared.ts';
import { cloneRecord } from './package_review_in_memory_shared.ts';

type SessionRepository = Pick<
  PackageReviewRepository,
  'createRuntimeSession' | 'getRuntimeSessionById'
>;

export function createInMemorySessionRepository(state: InMemoryRepositoryState): SessionRepository {
  return {
    createRuntimeSession(record) {
      const existing = state.runtimeSessions.find(
        (candidate) =>
          candidate.sessionId === record.sessionId ||
          candidate.sessionToken === record.sessionToken,
      );
      if (existing !== undefined) {
        throw new Error(`Runtime session ${record.sessionId} already exists.`);
      }
      state.runtimeSessions.push(cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    },
    getRuntimeSessionById(sessionId) {
      const record = state.runtimeSessions.find((candidate) => candidate.sessionId === sessionId);
      return Promise.resolve(record === undefined ? null : cloneRecord(record));
    },
  };
}
