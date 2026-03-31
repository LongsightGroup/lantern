import { createInMemoryAttemptRepository } from "./package_review_in_memory_attempts.ts";
import { createInMemoryDeploymentRepository } from "./package_review_in_memory_deployments.ts";
import { createInMemoryOpsRepositorySection } from "./package_review_in_memory_ops.ts";
import { createInMemoryPlacementRepository } from "./package_review_in_memory_placements.ts";
import { createInMemoryPreviewRepository } from "./package_review_in_memory_preview.ts";
import {
  createState,
  type InMemoryPackageReviewRepositoryOptions,
  type InMemoryRepository,
} from "./package_review_in_memory_shared.ts";
import { createInMemorySessionRepository } from "./package_review_in_memory_sessions.ts";
import { createInMemoryVersionRepository } from "./package_review_in_memory_versions.ts";

export function createInMemoryPackageReviewRepository(
  options: InMemoryPackageReviewRepositoryOptions = {},
): InMemoryRepository {
  const state = createState(options);

  return {
    ...createInMemoryVersionRepository(state),
    ...createInMemoryDeploymentRepository(state),
    ...createInMemorySessionRepository(state),
    ...createInMemoryPlacementRepository(state),
    ...createInMemoryPreviewRepository(state),
    ...createInMemoryAttemptRepository(state),
    ...createInMemoryOpsRepositorySection(state),
  };
}
