import type { RuntimeSessionRecord } from '../lti/types.ts';
import {
  requireRelativeSnapshotPath,
  toRelativeSnapshotPath,
  trimLeadingSlash,
} from '../package_review/snapshot_path.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import type { RuntimeArtifactStore } from './artifact_store.ts';
import {
  buildBrowserGraderHarnessSource,
  buildBrowserGraderRunnerSource,
  readReviewedBrowserGraderConfig,
} from './browser_grader.ts';
import { errorMessage, failRuntimeOutcome, isRuntimeOutcomeError } from './gateway_errors.ts';

const textEncoder = new TextEncoder();

export type RuntimeDeliverySubstrate = 'direct' | 'dynamic_worker';
export type RuntimeArtifactFailureCode =
  | 'runtime_file_invalid'
  | 'runtime_file_missing'
  | 'runtime_delivery_failed';

export interface RuntimeBinaryAsset {
  bytes: Uint8Array;
  contentType: string;
}

export interface RuntimeDeliveryDescriptor {
  substrate: RuntimeDeliverySubstrate;
  workerId: string | null;
}

export interface ReviewedRuntimeDeliveryContext {
  session: RuntimeSessionRecord;
  reviewedPackage: Pick<
    PackageVersionRecord,
    'id' | 'version' | 'artifact' | 'runtimeContractSignature' | 'grading' | 'manifestJson'
  >;
}

export interface RuntimeDelivery {
  readonly substrate: RuntimeDeliverySubstrate;
  describeDelivery(input: ReviewedRuntimeDeliveryContext): RuntimeDeliveryDescriptor;
  loadReviewedAsset(
    input: ReviewedRuntimeDeliveryContext & {
      relativePath: string;
    },
  ): Promise<RuntimeBinaryAsset>;
  loadBrowserGraderAsset(
    input: ReviewedRuntimeDeliveryContext & {
      assetPath: string;
    },
  ): Promise<RuntimeBinaryAsset | null>;
}

export function createDirectRuntimeDelivery(artifactStore: RuntimeArtifactStore): RuntimeDelivery {
  return {
    substrate: 'direct',
    describeDelivery() {
      return {
        substrate: 'direct',
        workerId: null,
      };
    },
    async loadReviewedAsset(input) {
      const relativePath = requireRelativeSnapshotPath(
        input.relativePath,
        'Runtime file path must stay inside the reviewed snapshot.',
      );

      return {
        bytes: await readRuntimeBytes({
          session: input.session,
          relativePath,
          readBytes: (path) => artifactStore.readBytes(input.session.snapshotRoot, path),
        }),
        contentType: contentTypeForRuntimePath(relativePath),
      };
    },
    async loadBrowserGraderAsset(input) {
      const config = readReviewedBrowserGraderConfig(input.reviewedPackage);

      if (config === null) {
        return null;
      }

      if (input.assetPath === 'jasmine.js') {
        return buildTextAsset(
          buildBrowserGraderHarnessSource(),
          'application/javascript; charset=UTF-8',
        );
      }

      if (input.assetPath === 'runner.js') {
        return buildTextAsset(
          buildBrowserGraderRunnerSource({
            reviewedSpecFiles: config.reviewedSpecFiles,
            scoreMaximum: config.scoreMaximum,
          }),
          'application/javascript; charset=UTF-8',
        );
      }

      const reviewedMatch = input.assetPath.match(/^reviewed\/([0-9]+)\.js$/);

      if (!reviewedMatch?.[1]) {
        return null;
      }

      const specPath = config.reviewedSpecFiles.at(Number(reviewedMatch[1]));

      if (!specPath) {
        return null;
      }

      const relativePath = requireRelativeSnapshotPath(
        trimLeadingSlash(specPath),
        'Browser grader spec path must stay inside the reviewed snapshot.',
      );

      return {
        bytes: await readRuntimeBytes({
          session: input.session,
          relativePath,
          readBytes: (path) => artifactStore.readBytes(input.session.snapshotRoot, path),
        }),
        contentType: contentTypeForRuntimePath(relativePath),
      };
    },
  };
}

export function createUnsupportedRuntimeDelivery(message: string): RuntimeDelivery {
  return {
    substrate: 'dynamic_worker',
    describeDelivery() {
      return {
        substrate: 'dynamic_worker',
        workerId: null,
      };
    },
    loadReviewedAsset(): Promise<RuntimeBinaryAsset> {
      return Promise.reject(new Error(message));
    },
    loadBrowserGraderAsset(): Promise<RuntimeBinaryAsset | null> {
      return Promise.reject(new Error(message));
    },
  };
}

export function contentTypeForRuntimePath(path: string): string {
  if (path.endsWith('.html')) {
    return 'text/html; charset=UTF-8';
  }

  if (path.endsWith('.js')) {
    return 'application/javascript; charset=UTF-8';
  }

  if (path.endsWith('.css')) {
    return 'text/css; charset=UTF-8';
  }

  if (path.endsWith('.json')) {
    return 'application/json';
  }

  if (path.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  if (path.endsWith('.png')) {
    return 'image/png';
  }

  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

export function runtimeEntrypointRelativePath(session: RuntimeSessionRecord): string {
  return toRelativeSnapshotPath(
    session.snapshotRoot,
    session.entrypointPath,
    'Runtime file is outside the reviewed snapshot.',
  );
}

function buildTextAsset(contents: string, contentType: string): RuntimeBinaryAsset {
  return {
    bytes: textEncoder.encode(contents),
    contentType,
  };
}

export function classifyRuntimeArtifactFailureCode(error: unknown): RuntimeArtifactFailureCode {
  const message = errorMessage(error);

  if (message.includes(' was not found.') || message.includes('Reviewed runtime asset not found')) {
    return 'runtime_file_missing';
  }

  return 'runtime_file_invalid';
}

type RuntimeBytesReader = (relativePath: string) => Promise<Uint8Array>;

async function readRuntimeBytes(input: {
  session: RuntimeSessionRecord;
  relativePath: string;
  readBytes: RuntimeBytesReader;
}): Promise<Uint8Array> {
  try {
    return await input.readBytes(input.relativePath);
  } catch (error) {
    if (isRuntimeOutcomeError(error)) {
      throw error;
    }

    failRuntimeOutcome({
      type: 'integrity_failure',
      code: classifyRuntimeArtifactFailureCode(error),
      message: errorMessage(error),
      status: 409,
      detail: {
        relativePath: input.relativePath,
      },
    });
  }
}
