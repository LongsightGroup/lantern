import type { JSONWebKeySet } from "jose";
import { createUnavailableAuthoringAiWriter } from "./authoring/ai_writer.ts";
import type { AppServices } from "./app_services.ts";
import {
  createHyperdriveDatabasePool,
  type HyperdriveBinding,
} from "./db/pool.ts";
import { createOpsRepository, type OpsRepository } from "./ops/repository.ts";
import type { EnvReader } from "./platform/env.ts";
import {
  importReferencePackage,
  isReferencePackageId,
  loadReferencePackageSnapshot,
  readReferencePackageReviewData,
} from "./package_review/intake.ts";
import {
  createBucketPackageSource,
  type PackageSource,
} from "./package_review/package_source.ts";
import {
  createPackageReviewRepository,
  type PackageReviewRepository,
} from "./package_review/repository.ts";
import {
  createR2PackageSnapshotStore,
  type PackageSnapshotStore,
} from "./package_review/snapshot_store.ts";
import { type RuntimeArtifactBucket } from "./runtime/artifact_store.ts";

const WORKER_REPOSITORY_MESSAGE =
  "Cloudflare Workers persistence requires a Hyperdrive binding named HYPERDRIVE. Bind Hyperdrive before using repository-backed Lantern routes on Workers.";
const WORKER_RUNTIME_ARTIFACT_MESSAGE =
  "Cloudflare Workers runtime artifact access requires an R2 binding named PACKAGE_ARTIFACTS. Bind the reviewed package snapshot bucket before serving runtime HTML, content, or files from Workers.";
const WORKER_REFERENCE_PACKAGE_MESSAGE =
  "Curated reference packages must be stored in PACKAGE_ARTIFACTS under reference-packages/<app-id>/source before Workers can import or inspect them.";

export interface WorkerBindings extends Record<string, unknown> {
  HYPERDRIVE?: HyperdriveBinding;
  PACKAGE_ARTIFACTS?: RuntimeArtifactBucket;
}

export function resolveWorkerServices(
  bindings: WorkerBindings,
  env: EnvReader,
): AppServices {
  const repositories = resolveWorkerRepositories(bindings);
  const snapshotStore = resolveWorkerSnapshotStore(bindings);

  return {
    env,
    authoringAiWriter: createUnavailableAuthoringAiWriter(),
    runtimeArtifactStore: snapshotStore,
    getRepository: () => repositories.repository,
    getOpsRepository: () => repositories.opsRepository,
    loadCanvasJwks: defaultLoadCanvasJwks,
    readReferencePackageReviewData: (appId) =>
      readReferencePackageReviewData(
        appId,
        resolveWorkerReferencePackageSource(bindings, appId),
      ),
    importReferencePackage: (appId, options = {}) =>
      importReferencePackage({
        appId,
        ...options,
        env,
        source: resolveWorkerReferencePackageSource(bindings, appId),
        snapshotStore,
      }),
    loadReferencePackageSnapshot: (appId, options = {}) =>
      loadReferencePackageSnapshot({
        appId,
        ...options,
        env,
        source: resolveWorkerReferencePackageSource(bindings, appId),
        snapshotStore,
      }),
  };
}

function resolveWorkerRepositories(bindings: WorkerBindings): {
  repository: PackageReviewRepository;
  opsRepository: OpsRepository;
} {
  const binding = bindings.HYPERDRIVE;

  if (!isHyperdriveBinding(binding)) {
    return {
      repository: createUnsupportedWorkerProxy<PackageReviewRepository>(
        WORKER_REPOSITORY_MESSAGE,
      ),
      opsRepository: createUnsupportedWorkerProxy<OpsRepository>(
        WORKER_REPOSITORY_MESSAGE,
      ),
    };
  }

  const pool = createHyperdriveDatabasePool(binding);

  return {
    repository: createPackageReviewRepository(pool),
    opsRepository: createOpsRepository(pool),
  };
}

function resolveWorkerSnapshotStore(
  bindings: WorkerBindings,
): PackageSnapshotStore {
  const bucket = bindings.PACKAGE_ARTIFACTS;

  if (isRuntimeArtifactBucket(bucket)) {
    return createR2PackageSnapshotStore(bucket);
  }

  return createUnsupportedSnapshotStore(WORKER_RUNTIME_ARTIFACT_MESSAGE);
}

function resolveWorkerReferencePackageSource(
  bindings: WorkerBindings,
  appId: string,
): PackageSource {
  if (!isReferencePackageId(appId)) {
    throw new Error(
      `Lantern does not ship a curated reference package for ${appId}.`,
    );
  }

  const bucket = bindings.PACKAGE_ARTIFACTS;

  if (isRuntimeArtifactBucket(bucket) && typeof bucket.list === "function") {
    return createBucketPackageSource(
      bucket,
      `reference-packages/${appId}/source`,
    );
  }

  return createUnsupportedPackageSource(WORKER_REFERENCE_PACKAGE_MESSAGE);
}

function createUnsupportedWorkerProxy<T>(message: string): T {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === Symbol.toStringTag) {
          return "UnsupportedWorkerService";
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

async function defaultLoadCanvasJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`LTI JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

function isRuntimeArtifactBucket(
  value: unknown,
): value is RuntimeArtifactBucket {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<RuntimeArtifactBucket>).get === "function"
  );
}

function isHyperdriveBinding(value: unknown): value is HyperdriveBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<HyperdriveBinding>).connectionString === "string"
  );
}
