import { createInMemoryAttemptRepository } from './package_review_in_memory_attempts.ts';
import { createInMemoryAuthoringRepository } from './package_review_in_memory_authoring.ts';
import { createInMemoryAppGenerationRepository } from './package_review_in_memory_app_generation.ts';
import { createInMemoryPreviewRepository } from './package_review_in_memory_preview.ts';
import {
  createState,
  type InMemoryPackageReviewRepositoryOptions,
  type InMemoryRepository,
} from './package_review_in_memory_shared.ts';
import { createInMemorySessionRepository } from './package_review_in_memory_sessions.ts';
import { createInMemoryVersionRepository } from './package_review_in_memory_versions.ts';

export function createInMemoryPackageReviewRepository(
  options: InMemoryPackageReviewRepositoryOptions = {},
): InMemoryRepository {
  const state = createState(options);

  return {
    ...createInMemoryVersionRepository(state),
    ...createInMemorySessionRepository(state),
    ...createInMemoryAuthoringRepository(state),
    ...createInMemoryAppGenerationRepository(state),
    ...createInMemoryPreviewRepository(state),
    ...createInMemoryAttemptRepository(state),
  };
}
