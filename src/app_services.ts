import type { JSONWebKeySet } from 'jose';
import {
  type AuthoringAiWriter,
  type AuthoringReferenceExample,
  createUnavailableAuthoringAiWriter,
} from './authoring/ai_writer.ts';
import { loadAuthoringReferenceExamples } from './authoring/example_context.ts';
import { materializeDraftPreviewPackageVersion } from './authoring/draft_snapshot.ts';
import { type EnvReader, getDefaultEnvReader } from './platform/env.ts';
import {
  getReferencePackageSourceRoot,
  type ImportedPackageVersion,
  importPackage,
  loadPackageSnapshot,
  readReferencePackageReviewData,
} from './package_review/intake.ts';
import type { PackageSource } from './package_review/package_source.ts';
import { createFileSystemPackageSource } from './package_review/package_source_fs.ts';
import { getDefaultPackageSnapshotStore } from './package_review/snapshot_store_fs.ts';
import { type PackageReviewRepository } from './package_review/repository.ts';
import type { OpsRepository } from './ops/repository.ts';
import type { RuntimeArtifactStore } from './runtime/artifact_store.ts';
import { getDefaultRuntimeArtifactStore } from './runtime/artifact_store_fs.ts';
import { createDirectRuntimeDelivery, type RuntimeDelivery } from './runtime/delivery.ts';
import type { EvidenceArtifactStore } from './runtime/evidence_artifact_store.ts';
import { getDefaultEvidenceArtifactStore } from './runtime/evidence_artifact_store_fs.ts';
import type { ManifestReviewData } from './package_review/manifest.ts';
import type { AuthoringDraftRecord, PackageVersionRecord } from './package_review/types.ts';

export interface AppServices {
  env: EnvReader;
  runtimeArtifactStore: RuntimeArtifactStore;
  runtimeDelivery: RuntimeDelivery;
  evidenceArtifactStore: EvidenceArtifactStore;
  authoringAiWriter: AuthoringAiWriter;
  loadAuthoringReferenceExamples: () => Promise<AuthoringReferenceExample[]>;
  materializeDraftPreviewPackageVersion: (input: {
    draft: AuthoringDraftRecord;
    packageVersion: PackageVersionRecord;
    createdAt: string;
  }) => Promise<PackageVersionRecord>;
  getRepository: () => PackageReviewRepository;
  getOpsRepository: () => OpsRepository;
  loadCanvasJwks: (url: string) => Promise<JSONWebKeySet>;
  readReferencePackageReviewData: (appId: string) => Promise<ManifestReviewData>;
  importPackageFromSource: (
    source: PackageSource,
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
  loadPackageSnapshotFromSource: (
    source: PackageSource,
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion | null>;
  importReferencePackage: (
    appId: string,
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
  loadReferencePackageSnapshot: (
    appId: string,
    options?: {
      storageRoot?: string;
    },
  ) => Promise<ImportedPackageVersion | null>;
}

let defaultRepository: PackageReviewRepository | null = null;
let defaultOpsRepository: OpsRepository | null = null;

const LOCAL_REPOSITORY_MESSAGE =
  'Lantern persistence is Cloudflare D1-only. Run Lantern through the Cloudflare Worker entrypoint with a DB binding.';

export function resolveServices(services: Partial<AppServices>): AppServices {
  const env = services.env ?? getDefaultEnvReader();
  const getRepository = services.getRepository ?? getDefaultRepository;
  const snapshotStore = getDefaultPackageSnapshotStore();
  const runtimeArtifactStore = services.runtimeArtifactStore ?? getDefaultRuntimeArtifactStore();
  const importPackageFromSource =
    services.importPackageFromSource ??
    ((source: PackageSource, options = {}) =>
      importPackage({
        ...options,
        env,
        source,
        snapshotStore,
      }));
  const loadPackageSnapshotFromSource =
    services.loadPackageSnapshotFromSource ??
    ((source: PackageSource, options = {}) =>
      loadPackageSnapshot({
        ...options,
        env,
        source,
        snapshotStore,
      }));

  return {
    env,
    authoringAiWriter: services.authoringAiWriter ?? createUnavailableAuthoringAiWriter(),
    runtimeArtifactStore,
    runtimeDelivery: services.runtimeDelivery ?? createDirectRuntimeDelivery(runtimeArtifactStore),
    evidenceArtifactStore: services.evidenceArtifactStore ?? getDefaultEvidenceArtifactStore(),
    loadAuthoringReferenceExamples:
      services.loadAuthoringReferenceExamples ?? loadAuthoringReferenceExamples,
    materializeDraftPreviewPackageVersion:
      services.materializeDraftPreviewPackageVersion ?? materializeDraftPreviewPackageVersion,
    getRepository,
    getOpsRepository:
      services.getOpsRepository ??
      (() => {
        const repository = getRepository();

        return isOpsRepository(repository) ? repository : getDefaultOpsRepository();
      }),
    loadCanvasJwks: services.loadCanvasJwks ?? defaultLoadCanvasJwks,
    importPackageFromSource,
    loadPackageSnapshotFromSource,
    readReferencePackageReviewData:
      services.readReferencePackageReviewData ??
      ((appId) => readReferencePackageReviewData(appId, resolveReferencePackageSource(appId))),
    importReferencePackage:
      services.importReferencePackage ??
      ((appId, options = {}) =>
        importPackageFromSource(resolveReferencePackageSource(appId), options)),
    loadReferencePackageSnapshot:
      services.loadReferencePackageSnapshot ??
      ((appId, options = {}) =>
        loadPackageSnapshotFromSource(resolveReferencePackageSource(appId), options)),
  };
}

function resolveReferencePackageSource(appId: string) {
  return createFileSystemPackageSource(getReferencePackageSourceRoot(appId));
}

function getDefaultRepository(): PackageReviewRepository {
  if (defaultRepository === null) {
    defaultRepository =
      createUnavailableLocalProxy<PackageReviewRepository>(LOCAL_REPOSITORY_MESSAGE);
  }

  return defaultRepository;
}

function getDefaultOpsRepository(): OpsRepository {
  if (defaultOpsRepository === null) {
    defaultOpsRepository = createUnavailableLocalProxy<OpsRepository>(LOCAL_REPOSITORY_MESSAGE);
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

function createUnavailableLocalProxy<T extends object>(message: string): T {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return null;
        }

        return () => {
          throw new Error(message);
        };
      },
    },
  ) as T;
}
