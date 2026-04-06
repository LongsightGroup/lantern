import type { Pool } from '@db/postgres';
import type { JSONWebKeySet } from 'jose';
import { createDatabasePool } from './db/pool.ts';
import {
  importDemoPackage,
  type ImportedPackageVersion,
  loadDemoPackageSnapshot,
} from './package_review/intake.ts';
import {
  createPackageReviewRepository,
  type PackageReviewRepository,
} from './package_review/repository.ts';
import { createOpsRepository, type OpsRepository } from './ops/repository.ts';

export interface AppServices {
  getRepository: () => PackageReviewRepository;
  getOpsRepository: () => OpsRepository;
  loadCanvasJwks: (url: string) => Promise<JSONWebKeySet>;
  importDemoPackage: (options?: { storageRoot?: string }) => Promise<ImportedPackageVersion>;
  loadDemoPackageSnapshot: (options?: {
    storageRoot?: string;
  }) => Promise<ImportedPackageVersion | null>;
}

let defaultPool: Pool | null = null;
let defaultRepository: PackageReviewRepository | null = null;
let defaultOpsRepository: OpsRepository | null = null;

export function resolveServices(services: Partial<AppServices>): AppServices {
  const getRepository = services.getRepository ?? getDefaultRepository;

  return {
    getRepository,
    getOpsRepository:
      services.getOpsRepository ??
      (() => {
        const repository = getRepository();

        return isOpsRepository(repository) ? repository : getDefaultOpsRepository();
      }),
    loadCanvasJwks: services.loadCanvasJwks ?? defaultLoadCanvasJwks,
    importDemoPackage: services.importDemoPackage ?? importDemoPackage,
    loadDemoPackageSnapshot: services.loadDemoPackageSnapshot ?? loadDemoPackageSnapshot,
  };
}

function getDefaultRepository(): PackageReviewRepository {
  if (defaultRepository === null) {
    defaultRepository = createPackageReviewRepository(getDefaultPool());
  }

  return defaultRepository;
}

function getDefaultOpsRepository(): OpsRepository {
  if (defaultOpsRepository === null) {
    defaultOpsRepository = createOpsRepository(getDefaultPool());
  }

  return defaultOpsRepository;
}

async function defaultLoadCanvasJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`LTI JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

function getDefaultPool(): Pool {
  if (defaultPool === null) {
    defaultPool = createDatabasePool();
  }

  return defaultPool;
}

function isOpsRepository(
  repository: PackageReviewRepository,
): repository is PackageReviewRepository & OpsRepository {
  return (
    typeof (repository as Partial<OpsRepository>).listControlPlaneDeployments === 'function' &&
    typeof (repository as Partial<OpsRepository>).getLatestBrokerVerificationStatus ===
      'function' &&
    typeof (repository as Partial<OpsRepository>).recordBrokerVerificationRun === 'function' &&
    typeof (repository as Partial<OpsRepository>).getRetryableGradePublicationLookup === 'function'
  );
}
