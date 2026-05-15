import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AppGenerationRunRecord } from '../app_writer/types.ts';
import { cloneRecord, type InMemoryRepositoryState } from './package_review_in_memory_shared.ts';

type AppGenerationRepository = Pick<
  PackageReviewRepository,
  'createAppGenerationRun' | 'getAppGenerationRunById' | 'updateAppGenerationRun'
>;

export function createInMemoryAppGenerationRepository(
  state: InMemoryRepositoryState,
): AppGenerationRepository {
  return {
    createAppGenerationRun(record) {
      if (
        state.appGenerationRuns.some((candidate) => candidate.generationId === record.generationId)
      ) {
        return Promise.reject(
          new Error(
            `App generation run ${record.generationId} already exists and cannot be replaced.`,
          ),
        );
      }

      state.appGenerationRuns.push(cloneRecord(record));

      return Promise.resolve(cloneRecord(record));
    },

    getAppGenerationRunById(generationId) {
      const record = state.appGenerationRuns.find(
        (candidate) => candidate.generationId === generationId,
      );

      return Promise.resolve(record ? cloneRecord(record) : null);
    },

    updateAppGenerationRun(record) {
      const index = state.appGenerationRuns.findIndex(
        (candidate) => candidate.generationId === record.generationId,
      );

      if (index < 0) {
        return Promise.reject(
          new Error(`App generation run ${record.generationId} was not found.`),
        );
      }

      state.appGenerationRuns.splice(index, 1, cloneRecord(record));

      return Promise.resolve(cloneRecord(record));
    },
  };
}

export function buildAppGenerationRunRecord(
  overrides: Partial<AppGenerationRunRecord> = {},
): AppGenerationRunRecord {
  return {
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    status: 'started',
    requestedAppId: null,
    generatedAppId: null,
    generatedVersion: null,
    packageVersionId: null,
    promptText: 'Make a vocabulary game.',
    normalizedRequest: null,
    appPlan: null,
    selectedStarterId: null,
    selectedContext: {},
    modelRequestMetadata: [],
    generationNotes: [],
    validationFindings: [],
    repairAttemptCount: 0,
    createdAt: '2026-05-14T12:00:00.000Z',
    updatedAt: '2026-05-14T12:00:00.000Z',
    ...overrides,
  };
}
