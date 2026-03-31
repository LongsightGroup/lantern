import { assert, assertEquals, assertRejects } from "@std/assert";
import { importDemoPackage } from "./intake.ts";

Deno.test("importDemoPackage snapshots the demo package into Lantern-managed storage", async () => {
  const storageRoot = await Deno.makeTempDir({ prefix: "lantern-storage-" });

  try {
    const result = await importDemoPackage({ storageRoot });

    assertEquals(result.reviewData.appId, "chapter-4-asteroids");
    assertEquals(result.reviewData.version, "0.1.0");
    assert(
      result.artifact.snapshotRoot.startsWith(
        `${storageRoot}/chapter-4-asteroids/0.1.0`,
      ),
    );
    assertEquals(
      result.artifact.manifestPath,
      `${result.artifact.snapshotRoot}/manifest.json`,
    );
    assertEquals(
      result.artifact.entrypointPath,
      `${result.artifact.snapshotRoot}/dist/index.html`,
    );
    assert(
      !result.artifact.snapshotRoot.startsWith(
        "examples/apps/chapter-4-asteroids",
      ),
    );
    assert(result.artifact.digest.startsWith("sha256:"));

    const sourceManifest = await Deno.readTextFile(
      "examples/apps/chapter-4-asteroids/manifest.json",
    );
    const snapshotManifest = await Deno.readTextFile(
      result.artifact.manifestPath,
    );
    const sourceEntrypoint = await Deno.readTextFile(
      "examples/apps/chapter-4-asteroids/dist/index.html",
    );
    const snapshotEntrypoint = await Deno.readTextFile(
      result.artifact.entrypointPath,
    );

    assertEquals(snapshotManifest, sourceManifest);
    assertEquals(snapshotEntrypoint, sourceEntrypoint);
  } finally {
    await Deno.remove(storageRoot, { recursive: true });
  }
});

Deno.test("importDemoPackage refuses to overwrite an existing immutable snapshot", async () => {
  const storageRoot = await Deno.makeTempDir({ prefix: "lantern-storage-" });

  try {
    await importDemoPackage({ storageRoot });

    await assertRejects(
      () => importDemoPackage({ storageRoot }),
      Error,
      "Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.",
    );
  } finally {
    await Deno.remove(storageRoot, { recursive: true });
  }
});
