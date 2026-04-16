import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { createObjectEnvReader } from "./platform/env.ts";
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

Deno.test("GET /admin/packages renders the generic package import action when no versions exist", async () => {
  const response = await createAdminApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "No apps yet.");
  assertStringIncludes(body, "Import package");
  assertStringIncludes(body, "Open reference apps");
  assertStringIncludes(body, 'href="/admin/packages/import"');
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
  const response = await createAdminApp({
    getRepository: () => repository,
  }).request("http://localhost/admin/packages");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Apps");
  assertStringIncludes(body, "1 app");
  assertStringIncludes(body, "Open app");
  assertStringIncludes(body, 'href="/admin/packages/chapter-4-asteroids"');
  assertStringIncludes(body, "App settings");
  assertStringIncludes(body, "Import package");
  assertStringIncludes(body, 'href="/admin/packages/import"');
  assertStringIncludes(body, "Import reference app");
  assertStringIncludes(body, "Signed in");
  assertStringIncludes(body, 'href="/admin/deployments"');
  assertStringIncludes(body, 'href="/admin/verification"');
  assertStringIncludes(body, 'href="/admin/placements"');
  assertEquals(body.includes("Pilot usage"), false);
  assertEquals(body.includes("Broker verification"), false);
  assertEquals(body.includes("Save check result"), false);
});

Deno.test("GET /admin/packages/import renders the generic package import page", async () => {
  const response = await createAdminApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages/import");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Import package");
  assertStringIncludes(body, "Choose one package directory.");
  assertStringIncludes(body, 'name="packageFiles"');
  assertStringIncludes(body, "Open reference apps");
});

Deno.test("GET /admin/packages/reference renders the reference app catalog on its own page", async () => {
  const response = await createAdminApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request("http://localhost/admin/packages/reference");

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Reference apps");
  assertStringIncludes(body, "Import Chapter 4 Asteroids");
  assertStringIncludes(body, "Import TypeScript Ladder Game");
  assertStringIncludes(body, "Import Quick Study");
  assertStringIncludes(body, "Import package");
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

  const response = await createAdminApp({
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
    "Each version shows whether it is the current reviewed baseline and whether it is live in LMS now.",
  );
  assertStringIncludes(body, "LMS setup");
  assertStringIncludes(body, "Open latest version");
  assertStringIncludes(body, "Manage settings");
  assertStringIncludes(body, "Test launch");
  assertStringIncludes(body, "Newest upload");
  assertStringIncludes(body, "Current reviewed baseline");
  assertStringIncludes(body, "Live now in 1 LMS setup");
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
  const chapter4 = buildImportedPackageVersion({ version: "0.1.0" });
  const app = createAdminApp({
    getRepository: () => repository,
    readReferencePackageReviewData: () => Promise.resolve(chapter4.reviewData),
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

Deno.test("POST /admin/packages/import imports the uploaded reviewed package and redirects to the app overview page", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const imported = buildImportedPackageVersion({
    appId: "uploaded-quiz",
    title: "Uploaded Quiz",
    version: "0.1.0",
  });
  const app = createAdminApp({
    getRepository: () => repository,
    loadPackageSnapshotFromSource: () => Promise.resolve(null),
    importPackageFromSource: () => Promise.resolve(imported),
  });

  const response = await app.request("http://localhost/admin/packages/import", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: buildPackageImportFormData(),
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/uploaded-quiz",
  );

  const saved = await repository.getPackageVersionByAppVersion(
    "uploaded-quiz",
    "0.1.0",
  );
  assertEquals(saved?.approvalStatus, "pending");
});

Deno.test("POST /admin/packages/import reopens the existing app overview when the exact version is already present", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        appId: "uploaded-quiz",
        version: "0.1.0",
      }),
    ],
  });
  const app = createAdminApp({
    getRepository: () => repository,
    loadPackageSnapshotFromSource: () =>
      Promise.reject(new Error("load should not run")),
    importPackageFromSource: () =>
      Promise.reject(new Error("import should not run")),
  });

  const response = await app.request("http://localhost/admin/packages/import", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: buildPackageImportFormData(),
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/admin/packages/uploaded-quiz",
  );
});

Deno.test("POST /admin/packages/import rejects an invalid uploaded package with an explicit notice", async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createAdminApp({
    getRepository: () => repository,
    loadPackageSnapshotFromSource: () =>
      Promise.reject(new Error("load should not run")),
    importPackageFromSource: () =>
      Promise.reject(new Error("import should not run")),
  });

  const response = await app.request("http://localhost/admin/packages/import", {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: buildPackageImportFormData({ includeManifest: false }),
  });

  assertEquals(response.status, 409);
  const body = await response.text();

  assertStringIncludes(body, "Package import blocked");
  assertStringIncludes(body, "Fix these items before import.");
  assertStringIncludes(body, "File /manifest.json");
  assertStringIncludes(
    body,
    "Referenced file /manifest.json is missing from the package.",
  );
  assertStringIncludes(
    body,
    "Add /manifest.json to the reviewed package or update /manifest.json to point at an existing file.",
  );
});

Deno.test("POST /admin/packages/import-reference reopens the existing reference app overview when the exact version is already present", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildPackageVersionRecord()],
  });
  const chapter4 = buildImportedPackageVersion({ version: "0.1.0" });
  const app = createAdminApp({
    getRepository: () => repository,
    readReferencePackageReviewData: () => Promise.resolve(chapter4.reviewData),
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
  const chapter4 = buildImportedPackageVersion({ version: "0.1.0" });
  const app = createAdminApp({
    getRepository: () => repository,
    readReferencePackageReviewData: () => Promise.resolve(chapter4.reviewData),
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
  const app = createAdminApp({
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
  const app = createAdminApp({ getRepository: () => repository });
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
  const app = createAdminApp({ getRepository: () => repository });

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
  const app = createAdminApp({ getRepository: () => seededRepository });
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

function createAdminApp(services: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    env: createObjectEnvReader({
      APP_ORIGIN: "http://localhost",
      LANTERN_OPERATOR_NAME: "Signed in",
    }),
    ...services,
  });
}

function buildPackageImportFormData(
  input: {
    appId?: string;
    packageRoot?: string;
    includeManifest?: boolean;
  } = {},
): FormData {
  const appId = input.appId ?? "uploaded-quiz";
  const packageRoot = input.packageRoot ?? appId;
  const formData = new FormData();

  if (input.includeManifest !== false) {
    formData.append(
      "packageFiles",
      new File([buildUploadedManifest(appId)], `${packageRoot}/manifest.json`, {
        type: "application/json",
      }),
    );
  }

  formData.append(
    "packageFiles",
    new File(
      ['<!doctype html><html lang="en"><body><main>Uploaded Quiz</main></body></html>'],
      `${packageRoot}/dist/index.html`,
      { type: "text/html" },
    ),
  );
  formData.append(
    "packageFiles",
    new File(['{"cards":[]}\n'], `${packageRoot}/content/activity.json`, {
      type: "application/json",
    }),
  );
  formData.append(
    "packageFiles",
    new File(
      [
        JSON.stringify({
          launch: {
            user_role: "learner",
            course_id: "course_123",
            assignment_id: "assignment_456",
            activity_id: "activity_1",
          },
          attempt_id: "attempt_123",
          local_state: null,
        }),
      ],
      `${packageRoot}/preview/fixtures.json`,
      {
        type: "application/json",
      },
    ),
  );
  formData.append(
    "packageFiles",
    new File(
      [
        JSON.stringify([
          {
            name: "renders main content",
            assert: {
              selector: "main",
              contains: "Uploaded Quiz",
            },
          },
        ]),
      ],
      `${packageRoot}/preview/tests.json`,
      {
        type: "application/json",
      },
    ),
  );

  return formData;
}

function buildUploadedManifest(appId: string): string {
  return JSON.stringify({
    schema_version: "1",
    app_id: appId,
    version: "0.1.0",
    title: "Uploaded Quiz",
    description: "A reviewed package uploaded through admin inventory.",
    owner: {
      type: "user",
      id: "instructor_123",
    },
    entrypoint: "/dist/index.html",
    roles: ["learner", "instructor"],
    install_scope: "course",
    capabilities: [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
      "read_local_state",
      "write_local_state",
    ],
    grading: {
      mode: "completion",
      max_score: 100,
    },
    content_files: ["/content/activity.json"],
    preview: {
      fixtures_file: "/preview/fixtures.json",
      tests_file: "/preview/tests.json",
    },
  });
}
