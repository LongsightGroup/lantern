import type { JSONWebKeySet } from 'jose';
import {
  createCloudflareAppWriterAgentSessionCoordinator,
  createUnavailableAppWriterAgentSessionCoordinator,
  isAppWriterAgentNamespace,
} from './app_writer/agent_session.ts';
import { createCloudflareAppWriterAgentWorkspaceHarness } from './app_writer/agent_workspace_harness.ts';
import { createUnavailableAppPackagePreviewer } from './app_writer/preview.ts';
import {
  createBoundAppPackagePreviewer,
  isAppPackagePreviewerBinding,
} from './app_writer/preview_binding.ts';
import {
  createBoundAppPackageSourceCompiler,
  isAppPackageSourceCompilerBinding,
} from './app_writer/source_compiler_binding.ts';
import type { AppPackageSourceCompiler } from './app_writer/types.ts';
import {
  type AppGenerationRunScheduler,
  createCloudflareWorkflowAppGenerationRunScheduler,
  isAppGenerationWorkflowBinding,
} from './app_writer/workflow_scheduler.ts';
import {
  createHarnessWorkspaceRunner,
  createUnavailableAppWriterWorkspaceRunner,
} from './app_writer/workspace_runner.ts';
import type { BrowserAutograderDraftReferenceExample } from './authoring/browser_autograder_draft_generator.ts';
import { createUnavailableBrowserAutograderDraftGenerator } from './authoring/browser_autograder_draft_generator.ts';
import type { AppServices } from './app_services.ts';
import { type D1Database, isD1Database } from './db/d1.ts';
import type { OpsRepository } from './ops/repository.ts';
import { createD1OpsRepository } from './ops/repository_d1.ts';
import type { EnvReader } from './platform/env.ts';
import {
  getReferencePackageBucketSourceRoot,
  importPackage,
  isReferencePackageId,
  loadPackageSnapshot,
  readReferencePackageReviewData,
} from './package_review/intake.ts';
import { createBucketPackageSource, type PackageSource } from './package_review/package_source.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';
import { createD1PackageReviewRepository } from './package_review/repository_package_versions_d1.ts';
import {
  createR2PackageSnapshotStore,
  type PackageSnapshotStore,
} from './package_review/snapshot_store.ts';
import { type RuntimeArtifactBucket } from './runtime/artifact_store.ts';
import {
  createDynamicWorkerRuntimeDelivery,
  type DynamicWorkerLoader,
} from './runtime/dynamic_worker_delivery.ts';
import { createUnsupportedRuntimeDelivery } from './runtime/delivery.ts';
import {
  assertEvidenceArtifactStorageKey,
  type EvidenceArtifactStore,
} from './runtime/evidence_artifact_store.ts';
import type { AuthoringDraftRecord, PackageVersionRecord } from './package_review/types.ts';

const WORKER_REPOSITORY_MESSAGE = 'Cloudflare Workers persistence requires a D1 binding named DB.';
const WORKER_RUNTIME_ARTIFACT_MESSAGE =
  'Cloudflare Workers runtime artifact access requires an R2 binding named PACKAGE_ARTIFACTS. Bind the reviewed package snapshot bucket before serving runtime HTML, content, or files from Workers.';
const WORKER_EVIDENCE_ARTIFACT_MESSAGE =
  'Cloudflare Workers evidence artifact storage requires an R2 binding named PACKAGE_ARTIFACTS with write access. Bind the reviewed package artifact bucket before accepting anonymous evidence uploads on Workers.';
const WORKER_REFERENCE_PACKAGE_MESSAGE =
  'Curated reference packages must be stored in PACKAGE_ARTIFACTS under reference-packages/<app-id>/source before Workers can import or inspect them. Run `deno task reference:sync --bucket=<bucket-name>` during Worker bootstrap or release.';
const WORKER_RUNTIME_DELIVERY_MESSAGE =
  'Cloudflare Workers reviewed runtime delivery requires a Worker Loader binding named LOADER. Bind the Dynamic Worker loader before serving immutable reviewed runtime bytes from Workers.';
const WORKER_BROWSER_AUTOGRADER_DRAFT_REFERENCE_MESSAGE =
  'Cloudflare Workers do not load local browser-autograder draft reference examples. Use the local Deno authoring flow for draft example scaffolding.';
const WORKER_AUTHORING_DRAFT_PREVIEW_MESSAGE =
  'Cloudflare Workers do not materialize draft preview snapshots from the local filesystem. Use the local Deno authoring preview flow instead.';
const WORKER_APP_GENERATION_WORKFLOW_MESSAGE =
  'Cloudflare Workers app generation requires a Workflows binding named APP_GENERATION_WORKFLOW.';
const WORKER_APP_SOURCE_COMPILER_MESSAGE =
  'Cloudflare Workers app writer requires a platform source compiler service binding named APP_WRITER_SOURCE_COMPILER.';
const WORKER_APP_PREVIEWER_MESSAGE =
  'Cloudflare Workers generated app preview requires a platform previewer service binding named APP_WRITER_PREVIEWER.';
const WORKER_APP_WRITER_AGENT_MESSAGE =
  'Cloudflare Workers app writer live sessions require a Durable Object binding named APP_WRITER_AGENT.';

export interface WorkerBindings extends Record<string, unknown> {
  DB?: D1Database;
  PACKAGE_ARTIFACTS?: RuntimeArtifactBucket;
  LOADER?: DynamicWorkerLoader;
  AI?: unknown;
  APP_GENERATION_WORKFLOW?: unknown;
  APP_WRITER_AGENT?: unknown;
  APP_WRITER_SOURCE_COMPILER?: unknown;
  APP_WRITER_PREVIEWER?: unknown;
}

export function resolveWorkerServices(bindings: WorkerBindings, env: EnvReader): AppServices {
  const repositories = resolveWorkerRepositories(bindings);
  const snapshotStore = resolveWorkerSnapshotStore(bindings);
  const importPackageFromSource = (source: PackageSource, options = {}) =>
    importPackage({
      ...options,
      env,
      source,
      snapshotStore,
    });
  const loadPackageSnapshotFromSource = (source: PackageSource, options = {}) =>
    loadPackageSnapshot({
      ...options,
      env,
      source,
      snapshotStore,
    });

  return {
    env,
    packageSnapshotStore: snapshotStore,
    appWriterWorkspaceRunner: resolveWorkerAppWriterWorkspaceRunner(bindings),
    appPackagePreviewer: resolveWorkerAppPackagePreviewer(bindings),
    appPackageSourceCompiler: resolveWorkerAppPackageSourceCompiler(bindings),
    appGenerationRunScheduler: resolveWorkerAppGenerationRunScheduler(bindings),
    appWriterAgentSessions: resolveWorkerAppWriterAgentSessions(bindings),
    browserAutograderDraftGenerator: createUnavailableBrowserAutograderDraftGenerator(),
    runtimeArtifactStore: snapshotStore,
    runtimeDelivery: resolveWorkerRuntimeDelivery(bindings, snapshotStore),
    evidenceArtifactStore: resolveWorkerEvidenceArtifactStore(bindings),
    loadBrowserAutograderDraftReferenceExamples:
      createUnsupportedBrowserAutograderDraftReferenceLoader(),
    materializeDraftPreviewPackageVersion: createUnsupportedDraftPreviewMaterializer(),
    getRepository: () => repositories.repository,
    getOpsRepository: () => repositories.opsRepository,
    loadCanvasJwks: defaultLoadCanvasJwks,
    importPackageFromSource,
    loadPackageSnapshotFromSource,
    readReferencePackageReviewData: (appId) =>
      readReferencePackageReviewData(appId, resolveWorkerReferencePackageSource(bindings, appId)),
    importReferencePackage: (appId, options = {}) =>
      importPackageFromSource(resolveWorkerReferencePackageSource(bindings, appId), options),
    loadReferencePackageSnapshot: (appId, options = {}) =>
      loadPackageSnapshotFromSource(resolveWorkerReferencePackageSource(bindings, appId), options),
  };
}

function resolveWorkerAppWriterAgentSessions(bindings: WorkerBindings) {
  if (isAppWriterAgentNamespace(bindings.APP_WRITER_AGENT)) {
    return createCloudflareAppWriterAgentSessionCoordinator(bindings.APP_WRITER_AGENT);
  }

  return createUnavailableAppWriterAgentSessionCoordinator(WORKER_APP_WRITER_AGENT_MESSAGE);
}

function resolveWorkerAppPackagePreviewer(bindings: WorkerBindings) {
  if (isAppPackagePreviewerBinding(bindings.APP_WRITER_PREVIEWER)) {
    return createBoundAppPackagePreviewer(bindings.APP_WRITER_PREVIEWER);
  }

  return createUnavailableAppPackagePreviewer(WORKER_APP_PREVIEWER_MESSAGE);
}

function resolveWorkerAppPackageSourceCompiler(bindings: WorkerBindings): AppPackageSourceCompiler {
  if (isAppPackageSourceCompilerBinding(bindings.APP_WRITER_SOURCE_COMPILER)) {
    return createBoundAppPackageSourceCompiler(bindings.APP_WRITER_SOURCE_COMPILER);
  }

  return {
    supportsTypeScriptAuthoring: true,
    compile(_input) {
      return Promise.reject(new Error(WORKER_APP_SOURCE_COMPILER_MESSAGE));
    },
  };
}

function resolveWorkerAppGenerationRunScheduler(
  bindings: WorkerBindings,
): AppGenerationRunScheduler {
  if (isAppGenerationWorkflowBinding(bindings.APP_GENERATION_WORKFLOW)) {
    return createCloudflareWorkflowAppGenerationRunScheduler(bindings.APP_GENERATION_WORKFLOW);
  }

  return {
    schedule(_input) {
      return Promise.reject(new Error(WORKER_APP_GENERATION_WORKFLOW_MESSAGE));
    },
  };
}

function resolveWorkerAppWriterWorkspaceRunner(bindings: WorkerBindings) {
  if (isAppWriterAgentNamespace(bindings.APP_WRITER_AGENT)) {
    return createHarnessWorkspaceRunner({
      harness: createCloudflareAppWriterAgentWorkspaceHarness(bindings.APP_WRITER_AGENT),
    });
  }

  return createUnavailableAppWriterWorkspaceRunner(WORKER_APP_WRITER_AGENT_MESSAGE);
}

function resolveWorkerRuntimeDelivery(
  bindings: WorkerBindings,
  snapshotStore: PackageSnapshotStore,
) {
  const loader = bindings.LOADER;

  if (isDynamicWorkerLoader(loader)) {
    return createDynamicWorkerRuntimeDelivery({
      loader,
      snapshotStore,
    });
  }

  return createUnsupportedRuntimeDelivery(WORKER_RUNTIME_DELIVERY_MESSAGE);
}

function resolveWorkerRepositories(bindings: WorkerBindings): {
  repository: PackageReviewRepository;
  opsRepository: OpsRepository;
} {
  if (isD1Database(bindings.DB)) {
    const repository = createD1PackageReviewRepository(bindings.DB);

    return {
      repository,
      opsRepository: createD1OpsRepository(bindings.DB, repository),
    };
  }

  return {
    repository: createUnsupportedWorkerProxy<PackageReviewRepository>(WORKER_REPOSITORY_MESSAGE),
    opsRepository: createUnsupportedWorkerProxy<OpsRepository>(WORKER_REPOSITORY_MESSAGE),
  };
}

function resolveWorkerSnapshotStore(bindings: WorkerBindings): PackageSnapshotStore {
  const bucket = bindings.PACKAGE_ARTIFACTS;

  if (isRuntimeArtifactBucket(bucket)) {
    return createR2PackageSnapshotStore(bucket);
  }

  return createUnsupportedSnapshotStore(WORKER_RUNTIME_ARTIFACT_MESSAGE);
}

function resolveWorkerEvidenceArtifactStore(bindings: WorkerBindings): EvidenceArtifactStore {
  const bucket = bindings.PACKAGE_ARTIFACTS;

  if (isRuntimeArtifactBucket(bucket) && typeof bucket.put === 'function') {
    return createR2EvidenceArtifactStore(bucket);
  }

  return createUnsupportedEvidenceArtifactStore(WORKER_EVIDENCE_ARTIFACT_MESSAGE);
}

function resolveWorkerReferencePackageSource(
  bindings: WorkerBindings,
  appId: string,
): PackageSource {
  if (!isReferencePackageId(appId)) {
    throw new Error(`Lantern does not ship a curated reference package for ${appId}.`);
  }

  const bucket = bindings.PACKAGE_ARTIFACTS;

  if (isRuntimeArtifactBucket(bucket) && typeof bucket.list === 'function') {
    return createBucketPackageSource(bucket, getReferencePackageBucketSourceRoot(appId));
  }

  return createUnsupportedPackageSource(WORKER_REFERENCE_PACKAGE_MESSAGE);
}

function createUnsupportedBrowserAutograderDraftReferenceLoader() {
  return (): Promise<BrowserAutograderDraftReferenceExample[]> => {
    throw new Error(WORKER_BROWSER_AUTOGRADER_DRAFT_REFERENCE_MESSAGE);
  };
}

function createUnsupportedDraftPreviewMaterializer() {
  return (_input: {
    draft: AuthoringDraftRecord;
    packageVersion: PackageVersionRecord;
    createdAt: string;
  }): Promise<PackageVersionRecord> => {
    throw new Error(WORKER_AUTHORING_DRAFT_PREVIEW_MESSAGE);
  };
}

function createUnsupportedWorkerProxy<T>(message: string): T {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === Symbol.toStringTag) {
          return 'UnsupportedWorkerService';
        }

        return () => {
          throw new Error(message);
        };
      },
    },
  ) as T;
}

function createUnsupportedSnapshotStore(message: string): PackageSnapshotStore {
  return {
    readBytes(): Promise<Uint8Array> {
      throw new Error(message);
    },
    writeBytes(): Promise<void> {
      throw new Error(message);
    },
    fileExists(): Promise<boolean> {
      throw new Error(message);
    },
    listFiles(): Promise<string[]> {
      throw new Error(message);
    },
  };
}

function createUnsupportedPackageSource(message: string): PackageSource {
  return {
    readBytes(): Promise<Uint8Array | null> {
      throw new Error(message);
    },
    readText(): Promise<string | null> {
      throw new Error(message);
    },
    fileExists(): Promise<boolean> {
      throw new Error(message);
    },
    listFiles(): Promise<string[]> {
      throw new Error(message);
    },
  };
}

function createR2EvidenceArtifactStore(bucket: RuntimeArtifactBucket): EvidenceArtifactStore {
  return {
    async writeBytes(storageKey, bytes) {
      const safeStorageKey = assertEvidenceArtifactStorageKey(storageKey);

      if (typeof bucket.put !== 'function') {
        throw new TypeError(WORKER_EVIDENCE_ARTIFACT_MESSAGE);
      }

      await bucket.put(safeStorageKey, bytes);
    },
    async readBytes(storageKey) {
      const safeStorageKey = assertEvidenceArtifactStorageKey(storageKey);
      const object = await bucket.get(safeStorageKey);

      if (object === null) {
        throw new Error(`Evidence artifact ${safeStorageKey} was not found.`);
      }

      return new Uint8Array(await object.arrayBuffer());
    },
  };
}

function createUnsupportedEvidenceArtifactStore(message: string): EvidenceArtifactStore {
  return {
    writeBytes(): Promise<void> {
      throw new Error(message);
    },
    readBytes(): Promise<Uint8Array> {
      throw new Error(message);
    },
  };
}

function isDynamicWorkerLoader(value: unknown): value is DynamicWorkerLoader {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<DynamicWorkerLoader>).get === 'function'
  );
}

async function defaultLoadCanvasJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`LTI JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

function isRuntimeArtifactBucket(value: unknown): value is RuntimeArtifactBucket {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<RuntimeArtifactBucket>).get === 'function'
  );
}
