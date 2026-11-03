import type { JSONWebKeySet } from 'jose';
import { type AdminAuthService, createUnconfiguredAdminAuthService } from './admin_auth/service.ts';
import {
  type AppWriterAgentSessionCoordinator,
  createNoopAppWriterAgentSessionCoordinator,
} from './app_writer/agent_session.ts';
import { createLocalAppPackagePreviewer } from './app_writer/preview_local.ts';
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
import {
  createUnavailablePythonLabArtifactStore,
  type PythonLabArtifactStore,
} from './python_lab/artifact_store.ts';
import {
  createUnavailablePythonLabRepository,
  type PythonLabRepository,
} from './python_lab/repository.ts';
import {
  createUnavailablePythonGraderSandboxFactory,
  type PythonGraderSandboxFactory,
} from './python_lab/runner.ts';
import { type PythonTestVectorGenerator } from './python_lab/service.ts';
import {
  createUnavailablePythonLabHumanVerifier,
  type PythonLabHumanVerifier,
} from './python_lab/turnstile.ts';
import {
  createUnavailablePythonLabGenerationScheduler,
  type PythonLabGenerationScheduler,
} from './python_lab/workflow.ts';
import type { LmsKernelRepository } from './lms_kernel/repository.ts';
import type { GovernedRosterService } from './lms_kernel/service.ts';
import type { ProtectedMediaService } from './lms_kernel/media.ts';
import type { LmsKernelAdminService } from './lms_kernel/admin_service.ts';

export interface AppServices {
  env: EnvReader;
  packageSnapshotStore: PackageSnapshotStore;
  runtimeArtifactStore: RuntimeArtifactStore;
  runtimeDelivery: RuntimeDelivery;
  evidenceArtifactStore: EvidenceArtifactStore;
  pythonLabRepository: PythonLabRepository;
  pythonLabArtifactStore: PythonLabArtifactStore;
  pythonGraderSandboxFactory: PythonGraderSandboxFactory;
  pythonTestVectorGenerator: PythonTestVectorGenerator;
  pythonLabHumanVerifier: PythonLabHumanVerifier;
  pythonLabGenerationScheduler: PythonLabGenerationScheduler;
  getLmsKernelRepository: () => LmsKernelRepository;
  governedRosterService: GovernedRosterService;
  protectedMediaService: ProtectedMediaService;
  lmsKernelAdminService: LmsKernelAdminService;
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

/** Builds explicit fakes for route tests. Production composition lives in app_worker_services.ts. */
export function resolveTestServices(services: Partial<AppServices>): AppServices {
  const env = services.env ?? getDefaultEnvReader();
  const getRepository = services.getRepository ?? getDefaultRepository;
  const snapshotStore = services.packageSnapshotStore ?? getDefaultPackageSnapshotStore();
  const runtimeArtifactStore = services.runtimeArtifactStore ?? getDefaultRuntimeArtifactStore();
  const ltiStorage = services.getLtiToolStorage?.() ?? createMemoryLtiStorage();
  const getLtiToolContext = createCachedLtiToolContextFactory({ env, storage: ltiStorage });
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
    packageSnapshotStore: snapshotStore,
    appWriterWorkspaceRunner:
      services.appWriterWorkspaceRunner ?? createUnavailableAppWriterWorkspaceRunner(),
    appPackagePreviewer: services.appPackagePreviewer ?? createLocalAppPackagePreviewer(),
    appPackageSourceCompiler:
      services.appPackageSourceCompiler ?? createTypeScriptAppPackageSourceCompiler(),
    appGenerationRunScheduler:
      services.appGenerationRunScheduler ?? createUnavailableAppGenerationRunScheduler(),
    appWriterAgentSessions:
      services.appWriterAgentSessions ?? createNoopAppWriterAgentSessionCoordinator(),
    browserAutograderDraftGenerator:
      services.browserAutograderDraftGenerator ??
      createUnavailableBrowserAutograderDraftGenerator(),
    adminAuth:
      services.adminAuth ??
      createUnconfiguredAdminAuthService(
        'Lantern admin authentication requires a Cloudflare D1 binding and BETTER_AUTH_SECRET.',
      ),
    runtimeArtifactStore,
    runtimeDelivery: services.runtimeDelivery ?? createDirectRuntimeDelivery(runtimeArtifactStore),
    evidenceArtifactStore: services.evidenceArtifactStore ?? getDefaultEvidenceArtifactStore(),
    pythonLabRepository:
      services.pythonLabRepository ??
      createUnavailablePythonLabRepository(
        'Python autograder Lab requires a Cloudflare D1 binding and private artifact storage.',
      ),
    pythonLabArtifactStore:
      services.pythonLabArtifactStore ??
      createUnavailablePythonLabArtifactStore(
        'Python autograder Lab requires private R2 artifact storage.',
      ),
    pythonGraderSandboxFactory:
      services.pythonGraderSandboxFactory ??
      createUnavailablePythonGraderSandboxFactory(
        'Python autograder Lab requires the PythonGraderSandbox binding.',
      ),
    pythonTestVectorGenerator: services.pythonTestVectorGenerator ?? {
      generate() {
        return Promise.reject(
          new Error(
            'Python autograder Lab requires a configured Workers AI test-vector generator.',
          ),
        );
      },
    },
    pythonLabHumanVerifier:
      services.pythonLabHumanVerifier ??
      createUnavailablePythonLabHumanVerifier(
        'Python autograder Lab requires a configured Turnstile verifier.',
      ),
    pythonLabGenerationScheduler:
      services.pythonLabGenerationScheduler ??
      createUnavailablePythonLabGenerationScheduler(
        'Python autograder Lab requires a configured generation Workflow.',
      ),
    getLmsKernelRepository: services.getLmsKernelRepository ?? getDefaultLmsKernelRepository,
    governedRosterService: services.governedRosterService ?? {
      listRoster() {
        return Promise.resolve({
          ok: false,
          error: {
            code: 'upstream_unavailable',
            traceId: crypto.randomUUID(),
          },
        });
      },
    },
    protectedMediaService: services.protectedMediaService ?? {
      fetch() {
        return Promise.resolve(
          new Response('Governed LMS primitives require Cloudflare D1.', { status: 503 }),
        );
      },
    },
    lmsKernelAdminService: services.lmsKernelAdminService ?? createUnavailableKernelAdminService(),
    loadBrowserAutograderDraftReferenceExamples:
      services.loadBrowserAutograderDraftReferenceExamples ??
      loadBrowserAutograderDraftReferenceExamples,
    materializeDraftPreviewPackageVersion:
      services.materializeDraftPreviewPackageVersion ?? materializeDraftPreviewPackageVersion,
    getRepository,
    getLtiToolStorage: services.getLtiToolStorage ?? (() => ltiStorage),
    getLtiToolContext: services.getLtiToolContext ?? getLtiToolContext,
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

function createUnavailableKernelAdminService(): LmsKernelAdminService {
  const unavailable = () =>
    Promise.resolve({
      ok: false as const,
      error: {
        code: 'invalid_request' as const,
        message: 'Governed LMS administration requires Cloudflare D1.',
      },
    });
  return {
    createInstitution: unavailable,
    createInvite: unavailable,
    acceptInvite: unavailable,
    createConnection: unavailable,
    installApp: unavailable,
    grantCapability: unavailable,
    activateInstallation: unavailable,
    revokeGrant: unavailable,
    createSyntheticLaunch: unavailable,
    disableInstallation: unavailable,
    disableConnection: unavailable,
  };
}

function resolveReferencePackageSource(appId: string) {
  return createFileSystemPackageSource(getReferencePackageSourceRoot(appId));
}

function getDefaultRepository(): PackageReviewRepository {
  throw new Error(LOCAL_REPOSITORY_MESSAGE);
}

function getDefaultLmsKernelRepository(): LmsKernelRepository {
  throw new Error(LOCAL_REPOSITORY_MESSAGE);
}

async function defaultLoadCanvasJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`LTI JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}
