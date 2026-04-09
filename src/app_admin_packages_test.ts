import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import {
  buildAccessibilityReview,
  buildBrokerVerificationStatus,
  buildControlPlaneDeploymentInventoryRow,
  buildDeploymentRecord,
  buildImportedPackageVersion,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import { buildCanvasDeploymentBinding } from "./test_helpers/lti.ts";

Deno.test("GET /admin/packages renders the shipped reference apps when no versions exist", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "No apps yet.");
  assertStringIncludes(body, "Open reference apps");
  assertStringIncludes(body, "Apps");
});

Deno.test("GET /admin/packages renders the app library when package data exists", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 1,
        approvalStatus: "approved",
        reviewNotes: "Ready for pilot.",
        reviewedAt: "2026-03-23T18:05:00Z",
      }),
    ],
    controlPlaneDeployments: [
      buildControlPlaneDeploymentInventoryRow({
        deploymentId: 1,
        deploymentSlug: "chapter-4-asteroids-pilot",
        deploymentLabel: "Chapter 4 Asteroids Pilot Deployment",
        lastGradePublishStatus: "failed",
      }),
    ],
    brokerVerifications: [buildBrokerVerificationStatus()],
  });
  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Apps");
  assertStringIncludes(body, "1 app");
  assertStringIncludes(body, "Open app");
  assertStringIncludes(body, 'href="/admin/packages/chapter-4-asteroids"');
  assertStringIncludes(body, "App settings");
  assertStringIncludes(body, "Import reference app");
  assertStringIncludes(body, "Signed in");
  assertStringIncludes(body, 'href="/admin/deployments"');
  assertStringIncludes(body, 'href="/admin/verification"');
  assertStringIncludes(body, 'href="/admin/placements"');
  assertEquals(body.includes("Pilot usage"), false);
  assertEquals(body.includes("Broker verification"), false);
  assertEquals(body.includes("Save check result"), false);
});

Deno.test("GET /admin/packages/reference renders the reference app catalog on its own page", async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages/reference");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Reference apps");
  assertStringIncludes(body, "Import Chapter 4 Asteroids");
  assertStringIncludes(body, "Import Office Hours Web Lab");
  assertStringIncludes(body, "Import Quick Study");
  assertStringIncludes(body, "Back to apps");
});

Deno.test("GET /admin/packages/:appId renders the app overview with versions and settings links", async () => {
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
    deployments: [
      buildDeploymentRecord({
        id: 3,
        slug: "chapter-4-asteroids-pilot",
        label: "Chapter 4 Asteroids Pilot Deployment",
        enabledPackageVersionId: 1,
        enabledPackageVersion: "0.1.0",
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages/chapter-4-asteroids");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(
    body,
    "Versions, governed launch tools, and LMS settings for this app.",
  );
  assertStringIncludes(body, "Reviewed versions");
  assertStringIncludes(
    body,
    "Latest approved stays the current reviewed baseline. LMS setup decides which approved version is live.",
  );
  assertStringIncludes(body, "LMS setup");
  assertStringIncludes(body, "Open latest version");
  assertStringIncludes(body, "Manage settings");
  assertStringIncludes(body, "Test launch");
  assertStringIncludes(body, "Latest upload");
  assertStringIncludes(body, "Latest approved");
  assertStringIncludes(body, "Live in 1 LMS setup");
  assertStringIncludes(body, "version-row-actions");
  assertStringIncludes(body, "App ID chapter-4-asteroids");
  assertEquals(
    body.includes('<p class="micro muted">App ID chapter-4-asteroids</p>'),
    false,
  );
  assertStringIncludes(body, "page-nav-link-current");
  assertStringIncludes(body, "Latest version");
});

Deno.test("POST /admin/packages/import-reference imports the selected reference app and redirects to the app overview page", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({
    getRepository: () => repository,
    loadReferencePackageSnapshot: () => Promise.resolve(null),
    importReferencePackage: () =>
      Promise.resolve(buildImportedPackageVersion({ version: "0.1.0" })),
  });
  const formData = new FormData();

  formData.set("appId", "chapter-4-asteroids");

  const response = await app.request(
    "http://localhost/admin/packages/import-reference",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids",
  );

  const saved = await repository.getPackageVersionByAppVersion(
    "chapter-4-asteroids",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/import-reference reopens the existing reference app overview when the exact version is already present", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord()],
  });
  const app = createApp({
    getRepository: () => repository,
    importReferencePackage: () =>
      Promise.reject(new Error("import should not run")),
  });
  const formData = new FormData();

  formData.set("appId", "chapter-4-asteroids");

  const response = await app.request(
    "http://localhost/admin/packages/import-reference",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids",
  );
});

Deno.test("POST /admin/packages/import-reference restores the selected reference app from the stored snapshot when the database row is missing", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({
    getRepository: () => repository,
    loadReferencePackageSnapshot: () =>
      Promise.resolve(buildImportedPackageVersion({ version: "0.1.0" })),
    importReferencePackage: () =>
      Promise.reject(new Error("import should not run")),
  });
  const formData = new FormData();

  formData.set("appId", "chapter-4-asteroids");

  const response = await app.request(
    "http://localhost/admin/packages/import-reference",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids",
  );

  const saved = await repository.getPackageVersionByAppVersion(
    "chapter-4-asteroids",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/import-reference imports quick-study when requested", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const quickStudy = buildImportedPackageVersion({
    appId: "quick-study",
    title: "Quick Study",
    version: "0.1.0",
  });
  const app = createApp({
    getRepository: () => repository,
    readReferencePackageReviewData: () =>
      Promise.resolve(quickStudy.reviewData),
    loadReferencePackageSnapshot: () => Promise.resolve(null),
    importReferencePackage: () => Promise.resolve(quickStudy),
  });
  const formData = new FormData();

  formData.set("appId", "quick-study");

  const response = await app.request(
    "http://localhost/admin/packages/import-reference",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(response.headers.get("location"), "/admin/packages/quick-study");

  const saved = await repository.getPackageVersionByAppVersion(
    "quick-study",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/:id/approve records notes and keeps status visible on reload", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord({ id: 7 })],
  });
  const app = createApp({ getRepository: () => repository });
  const formData = new FormData();

  formData.set("reviewNotes", "Ready for the pilot deployment.");
  formData.set("accessibilityKeyboard", "pass");
  formData.set("accessibilityFocusVisible", "pass");
  formData.set("accessibilityFocusNotObscured", "pass");
  formData.set("accessibilityStructure", "pass");
  formData.set("accessibilityContrast", "pass");
  formData.set("accessibilityReducedMotion", "fail");
  formData.set("accessibilityEquivalentAlternatives", "not_applicable");
  formData.set(
    "accessibilityFailureNotes",
    "Reduced-motion toggle is still missing on animated scenes.",
  );
  formData.set(
    "accessibilityExceptionNote",
    "Pilot exception approved for instructor-led use only.",
  );
  const accessibilityReview = buildAccessibilityReview({
    reducedMotion: "fail",
    failureNotes: "Reduced-motion toggle is still missing on animated scenes.",
    exceptionNote: "Pilot exception approved for instructor-led use only.",
  });

  const response = await app.request(
    "http://localhost/admin/packages/7/approve",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );

  const saved = await repository.getPackageVersionById(7);
  assert(saved);
  assertEquals(saved?.approvalStatus, "approved");
  assertEquals(saved?.reviewNotes, "Ready for the pilot deployment.");
  assertEquals(saved?.accessibilityReview, accessibilityReview);
  const auditEvents = await repository.listAuditEventsByEventType(
    "package.approved",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.packageVersionId, 7);

  const detailResponse = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0",
  );
  const detailBody = await detailResponse.text();

  assertStringIncludes(detailBody, "Approved");
  assertStringIncludes(detailBody, "Ready for the pilot deployment.");
  assertStringIncludes(detailBody, "Accessibility review");
  assertStringIncludes(detailBody, "Reduced motion");
  assertStringIncludes(
    detailBody,
    "Pilot exception approved for instructor-led use only.",
  );
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
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    "http://localhost/admin/packages/9/reject",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: new FormData(),
    },
  );

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, "Rejection blocked");
  assertStringIncludes(body, "already been reviewed and cannot change state");
});

Deno.test("POST /admin/packages/:appId/deployment/pin stores the exact approved version id", async () => {
  const seededRepository = createInMemoryPackageReviewRepository({
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
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });
  const app = createApp({ getRepository: () => seededRepository });
  const formData = new FormData();

  formData.set("lms", "canvas");
  formData.set("packageVersionId", "5");

  const response = await app.request(
    "http://localhost/admin/packages/chapter-4-asteroids/deployment/pin",
    {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: formData,
    },
  );

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/chapter-4-asteroids/deployment?lms=canvas#slot-panel",
  );

  const deployment = await seededRepository.getDeploymentBySlug(
    "chapter-4-asteroids-pilot",
  );
  assertEquals(deployment?.enabledPackageVersionId, 5);
  assertEquals(deployment?.enabledPackageVersion, "0.1.0");
  const auditEvents = await seededRepository.listAuditEventsByEventType(
    "deployment.version_pinned",
  );
  assertEquals(auditEvents.length, 1);
  assertEquals(auditEvents[0]?.deploymentRecordId, 3);
});
