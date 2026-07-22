import type { D1Database } from '../db/d1.ts';
import type { LmsKernelRepository } from './repository.ts';
import { createD1LmsConnectionRepository } from './repository_d1_connections.ts';
import { createD1GovernanceEventRepository } from './repository_d1_governance.ts';
import { createD1AppInstallationRepository } from './repository_d1_installations.ts';
import { createD1InstitutionRepository } from './repository_d1_institutions.ts';
import { createD1GovernedRuntimeRepository } from './repository_d1_runtime.ts';

export function createD1LmsKernelRepository(db: D1Database): LmsKernelRepository {
  return {
    ...createD1InstitutionRepository(db),
    ...createD1LmsConnectionRepository(db),
    ...createD1AppInstallationRepository(db),
    ...createD1GovernedRuntimeRepository(db),
    ...createD1GovernanceEventRepository(db),
  };
}
