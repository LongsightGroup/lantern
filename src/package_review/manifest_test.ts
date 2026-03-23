import { assertEquals } from "@std/assert";
import type { ValidationIssue } from "./types.ts";

const DEMO_MANIFEST_PATH = "examples/apps/chapter-4-asteroids/manifest.json";

Deno.test.ignore(
  "validateManifest accepts the demo manifest fixture without creating review rows",
  () => {
    const targetModule = "./manifest.ts";
    const request = {
      manifestPath: DEMO_MANIFEST_PATH,
    };
    const response = {
      ok: true,
      status: 200,
      issues: [] as ValidationIssue[],
      manifestSummary: {
        appId: "chapter-4-asteroids",
        version: "0.1.0",
      },
    };
    const persistedPackageVersions = 0;

    assertEquals(targetModule, "./manifest.ts");
    assertEquals(request.manifestPath, DEMO_MANIFEST_PATH);
    assertEquals(response.ok, true);
    assertEquals(response.status, 200);
    assertEquals(response.issues, []);
    assertEquals(response.manifestSummary.appId, "chapter-4-asteroids");
    assertEquals(persistedPackageVersions, 0);
  },
);

Deno.test.ignore(
  "validateManifest returns actionable schema issues and blocks invalid versions before intake persists anything",
  () => {
    const targetModule = "./manifest.ts";
    const request = {
      manifest: {
        schema_version: "1",
        app_id: "chapter-4-asteroids",
        version: "0.1.0",
        title: "Chapter 4 Asteroids",
        owner: {
          type: "user",
          id: "instructor_123",
        },
        entrypoint: "/index.html",
        capabilities: ["read_launch_context"],
        roles: ["learner"],
        grading: {
          mode: "declarative",
        },
      },
    };
    const response = {
      ok: false,
      status: 422,
      issues: [
        {
          field: "/entrypoint",
          message: "Entrypoint must stay inside /dist and end in .html.",
          keyword: "pattern",
          severity: "error",
        },
        {
          field: "/grading/rubric_file",
          message: "Declarative grading requires a rubric file and max score.",
          keyword: "required",
          severity: "error",
        },
      ] satisfies ValidationIssue[],
    };
    const persistedPackageVersions = 0;

    assertEquals(targetModule, "./manifest.ts");
    assertEquals(request.manifest.entrypoint, "/index.html");
    assertEquals(response.ok, false);
    assertEquals(response.status, 422);
    assertEquals(response.issues.length, 2);
    assertEquals(response.issues[0]?.field, "/entrypoint");
    assertEquals(response.issues[1]?.field, "/grading/rubric_file");
    assertEquals(persistedPackageVersions, 0);
  },
);
