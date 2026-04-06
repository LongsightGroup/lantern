import type { PackageReviewRepository } from '../package_review/repository.ts';
import type {
  InMemoryDeepLinkingRepository,
  InMemoryOpsRepository,
  InMemoryRepositoryState,
} from './package_review_in_memory_shared.ts';
import { cloneRecord } from './package_review_in_memory_shared.ts';

type SessionRepository = Pick<
  PackageReviewRepository,
  | 'createLoginState'
  | 'getLoginStateByState'
  | 'consumeLoginState'
  | 'createDynamicRegistrationState'
  | 'getDynamicRegistrationStateByState'
  | 'consumeDynamicRegistrationState'
  | 'createRuntimeSession'
  | 'getRuntimeSessionById'
  | 'getLatestRuntimeSessionByDeploymentId'
> &
  InMemoryDeepLinkingRepository &
  Pick<InMemoryOpsRepository, 'getRuntimeSessionByAttemptId'>;

export function createInMemorySessionRepository(state: InMemoryRepositoryState): SessionRepository {
  return {
    createLoginState(record) {
      const existing = state.loginStates.find((candidate) => candidate.state === record.state);

      if (existing) {
        throw new Error(`Login state ${record.state} already exists and cannot be reused.`);
      }

      state.loginStates.push(cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    },

    getLoginStateByState(stateId) {
      const record = state.loginStates.find((candidate) => candidate.state === stateId);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    consumeLoginState(input) {
      const index = state.loginStates.findIndex((candidate) => candidate.state === input.state);

      if (index < 0) {
        throw new Error(`Login state ${input.state} was not found.`);
      }

      const existing = state.loginStates[index];

      if (!existing) {
        throw new Error(`Login state ${input.state} was not found.`);
      }

      if (existing.usedAt !== null) {
        throw new Error(`Login state ${input.state} has already been used.`);
      }

      const nextRecord = cloneRecord({ ...existing, usedAt: input.usedAt });
      state.loginStates.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    createDynamicRegistrationState(record) {
      const existing = state.dynamicRegistrationStates.find(
        (candidate) => candidate.state === record.state,
      );

      if (existing) {
        throw new Error(
          `Dynamic registration state ${record.state} already exists and cannot be reused.`,
        );
      }

      state.dynamicRegistrationStates.push(cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    },

    getDynamicRegistrationStateByState(stateId) {
      const record = state.dynamicRegistrationStates.find(
        (candidate) => candidate.state === stateId,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    consumeDynamicRegistrationState(input) {
      const index = state.dynamicRegistrationStates.findIndex(
        (candidate) => candidate.state === input.state,
      );

      if (index < 0) {
        throw new Error(`Dynamic registration state ${input.state} was not found.`);
      }

      const existing = state.dynamicRegistrationStates[index];

      if (!existing) {
        throw new Error(`Dynamic registration state ${input.state} was not found.`);
      }

      if (existing.usedAt !== null) {
        throw new Error(`Dynamic registration state ${input.state} has already been used.`);
      }

      const nextRecord = cloneRecord({ ...existing, usedAt: input.usedAt });
      state.dynamicRegistrationStates.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    createRuntimeSession(record) {
      const existing = state.runtimeSessions.find(
        (candidate) =>
          candidate.sessionId === record.sessionId ||
          candidate.sessionToken === record.sessionToken,
      );

      if (existing) {
        throw new Error(
          `Runtime session ${record.sessionId} already exists and cannot be replaced.`,
        );
      }

      state.runtimeSessions.push(cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    },

    getRuntimeSessionById(sessionId) {
      const record = state.runtimeSessions.find((candidate) => candidate.sessionId === sessionId);
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getLatestRuntimeSessionByDeploymentId(deploymentRecordId) {
      const record = [...state.runtimeSessions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .find((candidate) => candidate.deploymentRecordId === deploymentRecordId);

      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    getRuntimeSessionByAttemptId(attemptId) {
      const record = [...state.runtimeSessions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .find((candidate) => candidate.attemptId === attemptId);

      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    createDeepLinkingSession(record) {
      const existing = state.deepLinkingSessions.find(
        (candidate) =>
          candidate.sessionId === record.sessionId ||
          candidate.sessionToken === record.sessionToken,
      );

      if (existing) {
        throw new Error(
          `Deep Linking session ${record.sessionId} already exists and cannot be replaced.`,
        );
      }

      state.deepLinkingSessions.push(cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    },

    getDeepLinkingSessionById(sessionId) {
      const record = state.deepLinkingSessions.find(
        (candidate) => candidate.sessionId === sessionId,
      );
      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    consumeDeepLinkingSession(input) {
      const index = state.deepLinkingSessions.findIndex(
        (candidate) => candidate.sessionId === input.sessionId,
      );

      if (index < 0) {
        throw new Error(`Deep Linking session ${input.sessionId} was not found.`);
      }

      const existing = state.deepLinkingSessions[index];

      if (!existing) {
        throw new Error(`Deep Linking session ${input.sessionId} was not found.`);
      }

      if (existing.usedAt !== null) {
        throw new Error(`Deep Linking session ${input.sessionId} has already been used.`);
      }

      const nextRecord = cloneRecord({ ...existing, usedAt: input.usedAt });
      state.deepLinkingSessions.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    updateDeepLinkingSessionSelection(input) {
      const index = state.deepLinkingSessions.findIndex(
        (candidate) => candidate.sessionId === input.sessionId,
      );

      if (index < 0) {
        throw new Error(`Deep Linking session ${input.sessionId} was not found.`);
      }

      const existing = state.deepLinkingSessions[index];

      if (!existing) {
        throw new Error(`Deep Linking session ${input.sessionId} was not found.`);
      }

      if (existing.usedAt !== null) {
        throw new Error(`Deep Linking session ${input.sessionId} has already been used.`);
      }

      const nextRecord = cloneRecord({
        ...existing,
        selection: input.selection === null ? null : { ...input.selection },
      });
      state.deepLinkingSessions.splice(index, 1, nextRecord);
      return Promise.resolve(cloneRecord(nextRecord));
    },

    listDeepLinkingResourceOptions(appId, placement) {
      const installScope = placement === 'assignment_selection' ? 'assignment' : 'course';

      return Promise.resolve(
        state.deepLinkingResourceOptions
          .filter(
            (candidate) => candidate.appId === appId && candidate.installScope === installScope,
          )
          .map(cloneRecord),
      );
    },
  };
}
