import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import {
  buildDeploymentRecord,
  buildImportedPackageVersion,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";

Deno.test("GET / responds with html", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/");

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("content-type"),
    "text/html; charset=UTF-8",
  );

  const body = await response.text();
  assertEquals(body.includes("Lantern"), true);
});

Deno.test("GET /health responds with ok", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/health");

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(await response.json(), { ok: true });
});

Deno.test("GET /admin/packages renders the demo-first zero state when no versions exist", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Start with the demo app");
  assertStringIncludes(body, "Chapter 4 Asteroids");
  assertStringIncludes(body, "Import the demo learning game");
});

Deno.test("GET /admin/packages renders exact version rows and approval-state badges", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 2,
        version: "0.2.0",
        approvalStatus: "pending",
      }),
    ],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "<strong>Version</strong> 0.2.0");
  assertStringIncludes(body, "Pending review");
  assertStringIncludes(body, "Approved");
  assertStringIncludes(body, "Open dossier");
  assertStringIncludes(body, "Version picker");
});

Deno.test("POST /admin/packages/import-demo imports the demo package and redirects to the dossier", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({
    getRepository: () => repository,
    importDemoPackage: () =>
      Promise.resolve(
        buildImportedPackageVersion({
          version: "0.1.0",
        }),
      ),
  });

  const response = await app.request(
    "http://localhost/admin/packages/import-demo",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionByAppVersion(
    "chapter-4-asteroids",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/:id/approve records notes and keeps status visible on reload", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord({ id: 7 })],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  formData.set("reviewNotes", "Ready for the pilot deployment.");

  const response = await app.request(
    "http://localhost/admin/packages/7/approve",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionById(7);
  assertEquals(saved?.approvalStatus, "approved");
  assertEquals(saved?.reviewNotes, "Ready for the pilot deployment.");

  const detailResponse = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );
  const detailBody = await detailResponse.text();

  assertStringIncludes(detailBody, "Approved");
  assertStringIncludes(detailBody, "Ready for the pilot deployment.");
});

Deno.test("POST /admin/packages/:id/reject refuses to reverse a frozen decision", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 9,
        approvalStatus: "approved",
        reviewNotes: "Already approved.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  const response = await app.request(
    "http://localhost/admin/packages/9/reject",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, "Rejection blocked");
  assertStringIncludes(body, "already been reviewed and cannot change state");
});

Deno.test("POST /admin/packages/:appId/deployment/pin stores the exact approved version id", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 5,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
      buildPackageVersionRecord({
        id: 6,
        version: "0.2.0",
        approvalStatus: "pending",
      }),
    ],
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 5,
        enabledPackageVersion: "0.1.0",
      }),
    ],
  });
  const app = createApp({
    getRepository: () => repository,
  });
  const formData = new FormData();

  formData.set("packageVersionId", "5");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/pin",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
      },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/deployment",
  );

  const deployment = await repository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  assertEquals(deployment?.enabledPackageVersionId, 5);
  assertEquals(deployment?.enabledPackageVersion, "0.1.0");
});
