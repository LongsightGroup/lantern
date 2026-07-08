import type { JSONWebKeySet } from 'jose';
import { type AdminAuthService, createUnconfiguredAdminAuthService } from './admin_auth/service.ts';
import {
  type AppWriterAgentSessionCoordinator,
  createNoopAppWriterAgentSessionCoordinator,
} from './app_writer/agent_session.ts';
import { createLocalAppPackagePreviewer } from './app_writer/preview.ts';
import { createTypeScriptAppPackageSourceCompiler } from './app_writer/typescript_source_compiler.ts';
import type { AppPackagePreviewer, AppPackageSourceCompiler } from './app_writer/types.ts';
import {
  type AppWriterWorkspaceRunner,
  createUnavailableAppWriterWorkspaceRunner,
} from './app_writer/workspace_runner.ts';
import {
  type AppGenerationRunScheduler,
  createUnavailableAppGenerationRunScheduler,
} from './app_writer/workflow_scheduler.ts';
import {
  type BrowserAutograderDraftGenerator,
  type BrowserAutograderDraftReferenceExample,
  createUnavailableBrowserAutograderDraftGenerator,
} from './authoring/browser_autograder_draft_generator.ts';
import { loadBrowserAutograderDraftReferenceExamples } from './authoring/example_context.ts';
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
import type { PackageSnapshotStore } from './package_review/snapshot_store.ts';
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
import { createMemoryLtiStorage, type LanternLtiToolContext } from './lti/tool_provider.ts';
import { createCachedLtiToolContextFactory } from './lti/context_factory.ts';
import type { LTIStorage } from '@longsightgroup/lti-tool';

export interface AppServices {
  env: EnvReader;
  packageSnapshotStore: PackageSnapshotStore;
  runtimeArtifactStore: RuntimeArtifactStore;
  runtimeDelivery: RuntimeDelivery;
  evidenceArtifactStore: EvidenceArtifactStore;
  appWriterWorkspaceRunner: AppWriterWorkspaceRunner;
  appPackagePreviewer: AppPackagePreviewer;
  appPackageSourceCompiler: AppPackageSourceCompiler;
  appGenerationRunScheduler: AppGenerationRunScheduler;
  appWriterAgentSessions: AppWriterAgentSessionCoordinator;
  browserAutograderDraftGenerator: BrowserAutograderDraftGenerator;
  adminAuth: AdminAuthService;
  loadBrowserAutograderDraftReferenceExamples: () => Promise<
    BrowserAutograderDraftReferenceExample[]
  >;
  materializeDraftPreviewPackageVersion: (input: {
    draft: AuthoringDraftRecord;
    packageVersion: PackageVersionRecord;
    createdAt: string;
  }) => Promise<PackageVersionRecord>;
  getRepository: () => PackageReviewRepository;
  getOpsRepository: () => OpsRepository;
  getLtiToolStorage: () => LTIStorage;
  getLtiToolContext: (appOrigin?: string) => Promise<LanternLtiToolContext>;
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

const LOCAL_REPOSITORY_MESSAGE =
  'Lantern persistence is Cloudflare D1-only. Run Lantern through the Cloudflare Worker entrypoint with a DB binding.';

export function resolveServices(services: Partial<AppServices>): AppServices {
  const env = services.env ?? getDefaultEnvReader();
  const getRepository = services.getRepository ?? getDefaultRepository;
  const snapshotStore = services.packageSnapshotStore ?? getDefaultPackageSnapshotStore();
  const runtimeArtifactStore = services.runtimeArtifactStore ?? getDefaultRuntimeArtifactStore();
  const ltiStorage = services.getLtiToolStorage?.() ?? createMemoryLtiStorage();
  const getLtiToolContext = createCachedLtiToolContextFactory({ env, storage: ltiStorage });
  const importPackageFromSource = services.importPackageFromSource ??
    ((source: PackageSource, options = {}) =>
      importPackage({
        ...options,
        env,
        source,
        snapshotStore,
      }));
  const loadPackageSnapshotFromSource = services.loadPackageSnapshotFromSource ??
    ((source: PackageSource, options = {}) =>
      loadPackageSnapshot({
        ...options,
        env,
        source,
        snapshotStore,
      }));

  return {
    env,
    packageSnapshotStore: snapshotStore,
    appWriterWorkspaceRunner: services.appWriterWorkspaceRunner ??
      createUnavailableAppWriterWorkspaceRunner(),
    appPackagePreviewer: services.appPackagePreviewer ?? createLocalAppPackagePreviewer(),
    appPackageSourceCompiler: services.appPackageSourceCompiler ??
      createTypeScriptAppPackageSourceCompiler(),
    appGenerationRunScheduler: services.appGenerationRunScheduler ??
      createUnavailableAppGenerationRunScheduler(),
    appWriterAgentSessions: services.appWriterAgentSessions ??
      createNoopAppWriterAgentSessionCoordinator(),
    browserAutograderDraftGenerator: services.browserAutograderDraftGenerator ??
      createUnavailableBrowserAutograderDraftGenerator(),
    adminAuth: services.adminAuth ??
      createUnconfiguredAdminAuthService(
        'Lantern admin authentication requires a Cloudflare D1 binding and BETTER_AUTH_SECRET.',
      ),
    runtimeArtifactStore,
    runtimeDelivery: services.runtimeDelivery ?? createDirectRuntimeDelivery(runtimeArtifactStore),
    evidenceArtifactStore: services.evidenceArtifactStore ?? getDefaultEvidenceArtifactStore(),
    loadBrowserAutograderDraftReferenceExamples:
      services.loadBrowserAutograderDraftReferenceExamples ??
        loadBrowserAutograderDraftReferenceExamples,
    materializeDraftPreviewPackageVersion: services.materializeDraftPreviewPackageVersion ??
      materializeDraftPreviewPackageVersion,
    getRepository,
    getOpsRepository: services.getOpsRepository ??
      (() => {
        const repository = getRepository();

        return isOpsRepository(repository) ? repository : getDefaultOpsRepository();
      }),
    getLtiToolStorage: services.getLtiToolStorage ?? (() => ltiStorage),
    getLtiToolContext: services.getLtiToolContext ?? getLtiToolContext,
    loadCanvasJwks: services.loadCanvasJwks ?? defaultLoadCanvasJwks,
    importPackageFromSource,
    loadPackageSnapshotFromSource,
    readReferencePackageReviewData: services.readReferencePackageReviewData ??
      ((appId) => readReferencePackageReviewData(appId, resolveReferencePackageSource(appId))),
    importReferencePackage: services.importReferencePackage ??
      ((appId, options = {}) =>
        importPackageFromSource(resolveReferencePackageSource(appId), options)),
    loadReferencePackageSnapshot: services.loadReferencePackageSnapshot ??
      ((appId, options = {}) =>
        loadPackageSnapshotFromSource(resolveReferencePackageSource(appId), options)),
  };
}

function resolveReferencePackageSource(appId: string) {
  return createFileSystemPackageSource(getReferencePackageSourceRoot(appId));
}

function getDefaultRepository(): PackageReviewRepository {
  throw new Error(LOCAL_REPOSITORY_MESSAGE);
}

function getDefaultOpsRepository(): OpsRepository {
  throw new Error(LOCAL_REPOSITORY_MESSAGE);
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
