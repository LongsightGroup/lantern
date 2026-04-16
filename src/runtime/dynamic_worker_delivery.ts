import type { PackageSnapshotStore } from "../package_review/snapshot_store.ts";
import {
  requireRelativeSnapshotPath,
  trimLeadingSlash,
} from "../package_review/snapshot_path.ts";
import {
  buildBrowserGraderHarnessSource,
  buildBrowserGraderRunnerSource,
  readReviewedBrowserGraderConfig,
} from "./browser_grader.ts";
import {
  contentTypeForRuntimePath,
  type ReviewedRuntimeDeliveryContext,
  type RuntimeBinaryAsset,
  type RuntimeDelivery,
  type RuntimeDeliveryDescriptor,
} from "./delivery.ts";
import { errorMessage, failRuntimeOutcome } from "./gateway_errors.ts";

const DYNAMIC_WORKER_COMPATIBILITY_DATE = "2026-04-06";
const REVIEWED_RUNTIME_ENVELOPE_VERSION = "v1";
const INTERNAL_BROWSER_GRADER_PREFIX = "/_lantern_internal/browser-grader";
const INTERNAL_RUNTIME_ORIGIN = "https://reviewed-runtime.internal";

const textEncoder = new TextEncoder();

export interface DynamicWorkerEntrypoint {
  fetch(request: Request): Promise<Response> | Response;
}

export interface DynamicWorkerInstance {
  getEntrypoint(): DynamicWorkerEntrypoint;
}

export interface DynamicWorkerCode {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
  globalOutbound: null;
}

export interface DynamicWorkerLoader {
  get(
    id: string,
    callback: () => Promise<DynamicWorkerCode> | DynamicWorkerCode,
  ): DynamicWorkerInstance;
}

interface ImmutableRuntimeAsset {
  contentType: string;
  bodyBase64: string;
}

export function createDynamicWorkerRuntimeDelivery(input: {
  loader: DynamicWorkerLoader;
  snapshotStore: PackageSnapshotStore;
  envelopeVersion?: string;
}): RuntimeDelivery {
  const envelopeVersion = input.envelopeVersion ??
    REVIEWED_RUNTIME_ENVELOPE_VERSION;

  return {
    substrate: "dynamic_worker",
    describeDelivery(delivery): RuntimeDeliveryDescriptor {
      return {
        substrate: "dynamic_worker",
        workerId: buildReviewedRuntimeWorkerId({
          runtimeContractSignature: delivery.reviewedPackage
            .runtimeContractSignature,
          envelopeVersion,
        }),
      };
    },
    async loadReviewedAsset(delivery) {
      const relativePath = requireRelativeSnapshotPath(
        delivery.relativePath,
        "Runtime file path must stay inside the reviewed snapshot.",
      );
      const response = await dispatchReviewedRuntimeWorkerRequest({
        ...delivery,
        loader: input.loader,
        snapshotStore: input.snapshotStore,
        envelopeVersion,
        path: buildReviewedAssetWorkerPath(relativePath),
      });
      const asset = await readRuntimeWorkerAssetResponse({
        response,
        missingReturnsNull: false,
        relativePath,
      });

      if (asset === null) {
        throw new Error("Reviewed runtime asset was unexpectedly missing.");
      }

      return asset;
    },
    async loadBrowserGraderAsset(delivery) {
      const config = readReviewedBrowserGraderConfig(delivery.reviewedPackage);

      if (config === null) {
        return null;
      }

      const response = await dispatchReviewedRuntimeWorkerRequest({
        ...delivery,
        loader: input.loader,
        snapshotStore: input.snapshotStore,
        envelopeVersion,
        path: buildBrowserGraderWorkerPath(delivery.assetPath),
      });

      return await readRuntimeWorkerAssetResponse({
        response,
        missingReturnsNull: true,
        relativePath: delivery.assetPath,
      });
    },
  };
}

export function buildReviewedRuntimeWorkerId(input: {
  runtimeContractSignature: string;
  envelopeVersion?: string;
}): string {
  return `reviewed-runtime:${
    input.envelopeVersion ?? REVIEWED_RUNTIME_ENVELOPE_VERSION
  }:${input.runtimeContractSignature}`;
}

export async function buildReviewedRuntimeWorkerCode(
  input: ReviewedRuntimeDeliveryContext & {
    snapshotStore: PackageSnapshotStore;
    envelopeVersion?: string;
  },
): Promise<DynamicWorkerCode> {
  const assets = await buildReviewedRuntimeAssetMap(input);

  return {
    compatibilityDate: DYNAMIC_WORKER_COMPATIBILITY_DATE,
    mainModule: "index.js",
    modules: {
      "index.js": buildReviewedRuntimeWorkerSource(assets),
    },
    globalOutbound: null,
  };
}

export async function buildReviewedRuntimeAssetMap(
  input: ReviewedRuntimeDeliveryContext & {
    snapshotStore: PackageSnapshotStore;
  },
): Promise<Record<string, ImmutableRuntimeAsset>> {
  const assets: Record<string, ImmutableRuntimeAsset> = {};
  const snapshotFiles = await input.snapshotStore.listFiles(
    input.session.snapshotRoot,
  );

  for (const relativePath of snapshotFiles) {
    const normalizedPath = requireRelativeSnapshotPath(
      relativePath,
      "Reviewed runtime asset path must stay inside the reviewed snapshot.",
    );
    const bytes = await input.snapshotStore.readBytes(
      input.session.snapshotRoot,
      normalizedPath,
    );

    assets[buildReviewedAssetWorkerPath(normalizedPath)] = {
      contentType: contentTypeForRuntimePath(normalizedPath),
      bodyBase64: encodeBase64(bytes),
    };
  }

  const browserGraderConfig = readReviewedBrowserGraderConfig(
    input.reviewedPackage,
  );

  if (browserGraderConfig !== null) {
    assets[buildBrowserGraderWorkerPath("jasmine.js")] = {
      contentType: "application/javascript; charset=UTF-8",
      bodyBase64: encodeBase64(
        textEncoder.encode(buildBrowserGraderHarnessSource()),
      ),
    };
    assets[buildBrowserGraderWorkerPath("runner.js")] = {
      contentType: "application/javascript; charset=UTF-8",
      bodyBase64: encodeBase64(
        textEncoder.encode(
          buildBrowserGraderRunnerSource({
            reviewedSpecFiles: browserGraderConfig.reviewedSpecFiles,
            scoreMaximum: browserGraderConfig.scoreMaximum,
          }),
        ),
      ),
    };

    for (
      const [index, specPath] of browserGraderConfig.reviewedSpecFiles.entries()
    ) {
      const normalizedPath = requireRelativeSnapshotPath(
        trimLeadingSlash(specPath),
        "Browser grader spec path must stay inside the reviewed snapshot.",
      );
      const bytes = await input.snapshotStore.readBytes(
        input.session.snapshotRoot,
        normalizedPath,
      );

      assets[buildBrowserGraderWorkerPath(`reviewed/${index}.js`)] = {
        contentType: contentTypeForRuntimePath(normalizedPath),
        bodyBase64: encodeBase64(bytes),
      };
    }
  }

  return assets;
}

async function dispatchReviewedRuntimeWorkerRequest(
  input: ReviewedRuntimeDeliveryContext & {
    loader: DynamicWorkerLoader;
    snapshotStore: PackageSnapshotStore;
    envelopeVersion: string;
    path: string;
  },
): Promise<Response> {
  try {
    const worker = input.loader.get(
      buildReviewedRuntimeWorkerId({
        runtimeContractSignature:
          input.reviewedPackage.runtimeContractSignature,
        envelopeVersion: input.envelopeVersion,
      }),
      () =>
        buildReviewedRuntimeWorkerCode({
          session: input.session,
          reviewedPackage: input.reviewedPackage,
          snapshotStore: input.snapshotStore,
          envelopeVersion: input.envelopeVersion,
        }),
    );

    return await worker.getEntrypoint().fetch(
      new Request(`${INTERNAL_RUNTIME_ORIGIN}${input.path}`),
    );
  } catch (error) {
    failRuntimeOutcome({
      type: "integrity_failure",
      code: "runtime_delivery_failed",
      message: errorMessage(error),
      status: 409,
      detail: {
        relativePath: input.path,
        deliverySubstrate: "dynamic_worker",
      },
    });
  }
}

async function readRuntimeWorkerAssetResponse(input: {
  response: Response;
  missingReturnsNull: boolean;
  relativePath: string;
}): Promise<RuntimeBinaryAsset | null> {
  if (input.response.status === 404 && input.missingReturnsNull) {
    return null;
  }

  if (!input.response.ok) {
    await failReviewedRuntimeWorkerResponse(input.response, input.relativePath);
  }

  return {
    bytes: new Uint8Array(await input.response.arrayBuffer()),
    contentType: input.response.headers.get("content-type") ??
      contentTypeForRuntimePath(input.relativePath),
  };
}

async function failReviewedRuntimeWorkerResponse(
  response: Response,
  relativePath: string,
): Promise<never> {
  const message = await response.text();
  const code = response.status === 404
    ? "runtime_file_missing"
    : "runtime_delivery_failed";

  failRuntimeOutcome({
    type: "integrity_failure",
    code,
    message: message === ""
      ? "Dynamic Worker runtime delivery failed."
      : message,
    status: 409,
    detail: {
      relativePath,
      deliverySubstrate: "dynamic_worker",
    },
  });
}

function buildReviewedRuntimeWorkerSource(
  assets: Record<string, ImmutableRuntimeAsset>,
): string {
  return `const assets = ${JSON.stringify(assets)};

export default {
  async fetch(request) {
    const asset = assets[new URL(request.url).pathname];

    if (!asset) {
      return new Response('Reviewed runtime asset not found.', { status: 404 });
    }

    return new Response(decodeBase64(asset.bodyBase64), {
      status: 200,
      headers: {
        'content-type': asset.contentType,
      },
    });
  },
};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}`;
}

function buildReviewedAssetWorkerPath(relativePath: string): string {
  const normalizedPath = requireRelativeSnapshotPath(
    relativePath,
    "Reviewed runtime asset path must stay inside the reviewed snapshot.",
  );

  return `/${normalizedPath}`;
}

function buildBrowserGraderWorkerPath(assetPath: string): string {
  const normalizedPath = requireRelativeSnapshotPath(
    trimLeadingSlash(assetPath),
    "Browser grader asset path must stay inside the reviewed snapshot.",
  );

  return `${INTERNAL_BROWSER_GRADER_PREFIX}/${normalizedPath}`;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}
