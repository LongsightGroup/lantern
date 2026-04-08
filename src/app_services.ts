import type { Pool } from "@db/postgres";
import type { JSONWebKeySet } from "jose";
import {
  type AuthoringAiWriter,
  createUnavailableAuthoringAiWriter,
} from "./authoring/ai_writer.ts";
import { createDatabasePool } from "./db/pool.ts";
import { getDenoEnvReader } from "./platform/deno_env.ts";
import { type EnvReader, getDefaultEnvReader } from "./platform/env.ts";
import {
  getReferencePackageSourceRoot,
  type ImportedPackageVersion,
  importReferencePackage,
  loadReferencePackageSnapshot,
  readReferencePackageReviewData,
} from "./package_review/intake.ts";
import { createFileSystemPackageSource } from "./package_review/package_source_fs.ts";
import { getDefaultPackageSnapshotStore } from "./package_review/snapshot_store_fs.ts";
import {
  createPackageReviewRepository,
  type PackageReviewRepository,
} from "./package_review/repository.ts";
import { createOpsRepository, type OpsRepository } from "./ops/repository.ts";
import type { RuntimeArtifactStore } from "./runtime/artifact_store.ts";
import { getDefaultRuntimeArtifactStore } from "./runtime/artifact_store_fs.ts";
import type { ManifestReviewData } from "./package_review/manifest.ts";

export interface AppServices {
  env: EnvReader;
  runtimeArtifactStore: RuntimeArtifactStore;
  authoringAiWriter: AuthoringAiWriter;
  getRepository: () => PackageReviewRepository;
  getOpsRepository: () => OpsRepository;
  loadCanvasJwks: (url: string) => Promise<JSONWebKeySet>;
  readReferencePackageReviewData: (
    appId: string,
  ) => Promise<ManifestReviewData>;
  importReferencePackage: (
    appId: string,
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
  loadReferencePackageSnapshot: (appId: string, options?: {
    storageRoot?: string;
  }) => Promise<ImportedPackageVersion | null>;
}

let defaultPool: Pool | null = null;
let defaultRepository: PackageReviewRepository | null = null;
let defaultOpsRepository: OpsRepository | null = null;

export function resolveServices(services: Partial<AppServices>): AppServices {
  const env = services.env ?? getDefaultEnvReader();
  const getRepository = services.getRepository ?? getDefaultRepository;
  const snapshotStore = getDefaultPackageSnapshotStore();

  return {
    env,
    authoringAiWriter: services.authoringAiWriter ??
      createUnavailableAuthoringAiWriter(),
    runtimeArtifactStore: services.runtimeArtifactStore ??
      getDefaultRuntimeArtifactStore(),
    getRepository,
    getOpsRepository: services.getOpsRepository ??
      (() => {
        const repository = getRepository();

        return isOpsRepository(repository)
          ? repository
          : getDefaultOpsRepository();
      }),
    loadCanvasJwks: services.loadCanvasJwks ?? defaultLoadCanvasJwks,
    readReferencePackageReviewData: services.readReferencePackageReviewData ??
      ((appId) =>
        readReferencePackageReviewData(
          appId,
          resolveReferencePackageSource(appId),
        )),
    importReferencePackage: services.importReferencePackage ??
      ((appId, options = {}) =>
        importReferencePackage({
          appId,
          ...options,
          env,
          source: resolveReferencePackageSource(appId),
          snapshotStore,
        })),
    loadReferencePackageSnapshot: services.loadReferencePackageSnapshot ??
      ((appId, options = {}) =>
        loadReferencePackageSnapshot({
          appId,
          ...options,
          env,
          source: resolveReferencePackageSource(appId),
          snapshotStore,
        })),
  };
}

function resolveReferencePackageSource(appId: string) {
  return createFileSystemPackageSource(getReferencePackageSourceRoot(appId));
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
    defaultPool = createDatabasePool(getDenoEnvReader());
  }

  return defaultPool;
}

function isOpsRepository(
  repository: PackageReviewRepository,
): repository is PackageReviewRepository & OpsRepository {
  return (
    typeof (repository as Partial<OpsRepository>)
        .listControlPlaneDeployments === "function" &&
    typeof (repository as Partial<OpsRepository>)
        .getLatestBrokerVerificationStatus ===
      "function" &&
    typeof (repository as Partial<OpsRepository>)
        .recordBrokerVerificationRun === "function" &&
    typeof (repository as Partial<OpsRepository>)
        .getRetryableGradePublicationLookup === "function"
  );
}
