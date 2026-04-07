import { assertEquals, assertRejects } from "@std/assert";
import { resolveWorkerServices } from "./app_worker_services.ts";
import { createObjectEnvReader } from "./platform/env.ts";
import { verifyReviewedRuntimeContractSignature } from "./package_review/runtime_contract.ts";
import type { RuntimeArtifactBucket } from "./runtime/artifact_store.ts";
import { getTestToolPrivateJwkEnvValue } from "./test_helpers/lti.ts";

const DEMO_SOURCE_ROOT = "examples/apps/chapter-4-asteroids";
const DEMO_BUCKET_SOURCE_ROOT = "reference-packages/chapter-4-asteroids/source";
const DEMO_SNAPSHOT_ROOT = "var/packages/chapter-4-asteroids/0.1.0";

Deno.test("worker services import and reload the demo package from PACKAGE_ARTIFACTS", async () => {
  const bucket = await createSeededArtifactBucket(
    DEMO_SOURCE_ROOT,
    DEMO_BUCKET_SOURCE_ROOT,
  );
  const env = createObjectEnvReader({
    LTI_TOOL_PRIVATE_JWK: getTestToolPrivateJwkEnvValue(),
  });
  const services = resolveWorkerServices({ PACKAGE_ARTIFACTS: bucket }, env);

  assertEquals(
    await services.loadReferencePackageSnapshot("chapter-4-asteroids"),
    null,
  );

  const reviewData = await services.readReferencePackageReviewData(
    "chapter-4-asteroids",
  );

  assertEquals(reviewData.appId, "chapter-4-asteroids");
  assertEquals(reviewData.version, "0.1.0");

  const imported = await services.importReferencePackage("chapter-4-asteroids");

  assertEquals(imported.artifact.snapshotRoot, DEMO_SNAPSHOT_ROOT);
  assertEquals(
    imported.artifact.manifestPath,
    `${DEMO_SNAPSHOT_ROOT}/manifest.json`,
  );
  assertEquals(
    imported.artifact.entrypointPath,
    `${DEMO_SNAPSHOT_ROOT}/dist/index.html`,
  );
  assertEquals(
    await readBucketText(bucket, `${DEMO_SNAPSHOT_ROOT}/manifest.json`),
    await Deno.readTextFile(`${DEMO_SOURCE_ROOT}/manifest.json`),
  );

  await verifyReviewedRuntimeContractSignature({
    runtimeContract: imported.runtimeContract,
    runtimeContractSignature: imported.runtimeContractSignature,
    env,
  });

  const loaded = await services.loadReferencePackageSnapshot(
    "chapter-4-asteroids",
  );

  if (loaded === null) {
    throw new Error("Expected stored demo package snapshot after import.");
  }

  assertEquals(loaded.reviewData.appId, imported.reviewData.appId);
  assertEquals(loaded.reviewData.version, imported.reviewData.version);
  assertEquals(loaded.artifact.digest, imported.artifact.digest);

  await verifyReviewedRuntimeContractSignature({
    runtimeContract: loaded.runtimeContract,
    runtimeContractSignature: loaded.runtimeContractSignature,
    env,
  });

  await assertRejects(
    () => services.importReferencePackage("chapter-4-asteroids"),
    Error,
    "Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.",
  );
});

function createInMemoryArtifactBucket(
  files: Record<string, Uint8Array | string>,
): RuntimeArtifactBucket {
  const storedFiles = new Map(
    Object.entries(files).map(([key, value]) => [key, toUint8Array(value)]),
  );

  return {
    get(key) {
      const bytes = storedFiles.get(key);

      if (bytes === undefined) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        arrayBuffer() {
          return Promise.resolve(bytes.slice().buffer);
        },
      });
    },
    put(key, value) {
      storedFiles.set(key, toUint8Array(value));

      return Promise.resolve();
    },
    list(options) {
      return Promise.resolve({
        objects: [...storedFiles.keys()]
          .filter((key) => key.startsWith(options.prefix))
          .sort()
          .map((key) => ({ key })),
      });
    },
  };
}

async function createSeededArtifactBucket(
  sourceRoot: string,
  bucketRoot: string,
): Promise<RuntimeArtifactBucket> {
  const files: Record<string, Uint8Array> = {};

  for (const relativePath of await listFiles(sourceRoot)) {
    files[`${bucketRoot}/${relativePath}`] = await Deno.readFile(
      `${sourceRoot}/${relativePath}`,
    );
  }

  return createInMemoryArtifactBucket(files);
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  await walkFiles(root, "", files);
  files.sort();

  return files;
}

async function walkFiles(
  root: string,
  relativeRoot: string,
  files: string[],
): Promise<void> {
  const absoluteRoot = relativeRoot === "" ? root : `${root}/${relativeRoot}`;

  for await (const entry of Deno.readDir(absoluteRoot)) {
    const relativePath = relativeRoot === ""
      ? entry.name
      : `${relativeRoot}/${entry.name}`;

    if (entry.isDirectory) {
      await walkFiles(root, relativePath, files);
      continue;
    }

    if (entry.isFile) {
      files.push(relativePath);
    }
  }
}

async function readBucketText(
  bucket: RuntimeArtifactBucket,
  key: string,
): Promise<string> {
  const object = await bucket.get(key);

  if (object === null) {
    throw new Error(`Expected bucket object ${key}.`);
  }

  return new TextDecoder().decode(await object.arrayBuffer());
}

function toUint8Array(
  value: string | Uint8Array | ArrayBuffer | ArrayBufferView,
): Uint8Array {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  if (value instanceof Uint8Array) {
    return value.slice();
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }

  return new Uint8Array(value.slice(0));
}
