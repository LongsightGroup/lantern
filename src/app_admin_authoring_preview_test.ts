import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { withRuntimeOriginEnv } from "./app_test_support.ts";
import {
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
  createInMemoryPackageReviewRepository,
} from "./test_helpers/package_review.ts";
import type {
  AuthoringDraftFileRecord,
  AuthoringDraftRecord,
} from "./package_review/types.ts";

const TEMPLATE_SNAPSHOT_ROOT = "examples/apps/template";
const DRAFT_ID = "authoring-draft-101";
const SAVED_DRAFT_SPEC = `describe("template authoring checks", () => {
  it("checks alt text coverage", () => {});
});
`;

Deno.test("POST /authoring/preview launches a draft snapshot through the governed preview runtime path", async () => {
  await withRuntimeOriginEnv(async () => {
    const repository = createInMemoryPackageReviewRepository({
      packageVersions: [buildTemplateAuthoringPackageVersionRecord()],
      authoringDrafts: [buildTemplateAuthoringDraft()],
      authoringDraftFiles: [buildTemplateAuthoringDraftFile()],
    });
    const app = createApp({ getRepository: () => repository });

    try {
      const response = await app.request(
        "https://lantern.example/admin/packages/template-app/versions/0.1.0/authoring/preview",
        {
          method: "POST",
          headers: { Origin: "https://lantern.example" },
          body: new FormData(),
        },
      );

      assertEquals(response.status, 303);
      const runtimeLocation = new URL(response.headers.get("location") ?? "");
      const runtimeSessionId = runtimeLocation.pathname.split("/").at(-1) ?? "";
      const runtimeSession = await repository.getRuntimeSessionById(
        runtimeSessionId,
      );
      const previewSession = await repository
        .getLatestPreviewSessionByPackageVersion(
          101,
          "adminAuthoringDraft",
        );
      const draft = await repository.getAuthoringDraftById(DRAFT_ID);
      const approvedPackageVersion = await repository.getPackageVersionById(
        101,
      );
      const evidence = previewSession === null
        ? []
        : await repository.listPreviewEvidence(previewSession.sessionId);
      const materializedSpec = previewSession === null
        ? ""
        : await Deno.readTextFile(
          `${previewSession.snapshotRoot}/grading/specs/checks.spec.js`,
        );

      assertEquals(previewSession?.origin, "adminAuthoringDraft");
      assertEquals(
        previewSession?.snapshotRoot.startsWith(
          `var/authoring-drafts/${DRAFT_ID}/snapshots/`,
        ),
        true,
      );
      assertEquals(runtimeSession?.snapshotRoot, previewSession?.snapshotRoot);
      assertEquals(
        previewSession?.snapshotRoot === TEMPLATE_SNAPSHOT_ROOT,
        false,
      );
      assertEquals(
        approvedPackageVersion?.artifact.snapshotRoot,
        TEMPLATE_SNAPSHOT_ROOT,
      );
      assertEquals(evidence[0]?.detail.origin, "adminAuthoringDraft");
      assertEquals(
        evidence[0]?.detail.route,
        "/admin/packages/template-app/versions/0.1.0/authoring",
      );
      assertStringIncludes(materializedSpec, "checks alt text coverage");
      assertEquals(draft?.lastPreviewedAt !== null, true);
    } finally {
      await Deno.remove("var/authoring-drafts", { recursive: true }).catch(() =>
        undefined
      );
    }
  });
});

Deno.test("POST /authoring/preview fails clearly when no saved draft files exist", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildTemplateAuthoringPackageVersionRecord()],
    authoringDrafts: [buildTemplateAuthoringDraft()],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    "https://lantern.example/admin/packages/template-app/versions/0.1.0/authoring/preview",
    {
      method: "POST",
      headers: { Origin: "https://lantern.example" },
      body: new FormData(),
    },
  );

  assertEquals(response.status, 409);
  assertStringIncludes(
    await response.text(),
    "Preview requires at least one saved draft file.",
  );
});

Deno.test("GET /authoring renders the latest draft preview state and evidence list", async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [buildTemplateAuthoringPackageVersionRecord()],
    authoringDrafts: [{
      ...buildTemplateAuthoringDraft(),
      lastPreviewedAt: "2026-04-08T17:05:00Z",
    }],
    authoringDraftFiles: [buildTemplateAuthoringDraftFile()],
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: "preview-session-draft-1",
        packageVersionId: 101,
        appId: "template-app",
        packageVersion: "0.1.0",
        packageTitle: "Template App",
        origin: "adminAuthoringDraft",
        contentPath: "/content/activity.json",
        deepLinkingSessionId: null,
        snapshotRoot:
          `var/authoring-drafts/${DRAFT_ID}/snapshots/20260408T170000000Z`,
        entrypointPath:
          `var/authoring-drafts/${DRAFT_ID}/snapshots/20260408T170000000Z/dist/index.html`,
      }),
    ],
    previewEvidence: [
      buildPreviewEvidenceRecord({
        previewSessionId: "preview-session-draft-1",
        summary: "Draft preview launched through Lantern runtime.",
        detail: {
          route: "/admin/packages/template-app/versions/0.1.0/authoring",
          origin: "adminAuthoringDraft",
        },
      }),
    ],
  });
  const app = createApp({ getRepository: () => repository });

  const response = await app.request(
    "http://localhost/admin/packages/template-app/versions/0.1.0/authoring",
  );

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, "Latest draft preview");
  assertStringIncludes(body, "preview-session-draft-1");
  assertStringIncludes(body, "Draft preview launched through Lantern runtime.");
  assertStringIncludes(
    body,
    "/admin/packages/template-app/versions/0.1.0/authoring",
  );
});

function buildTemplateAuthoringPackageVersionRecord() {
  return buildPackageVersionRecord({
    id: 101,
    appId: "template-app",
    version: "0.1.0",
    title: "Template App",
    description: "Minimal browser autograder starter.",
    approvalStatus: "approved",
    reviewNotes: "Approved for authoring preview tests.",
    reviewedAt: "2026-04-08T17:00:00Z",
    grading: {
      mode: "manual",
      rubricFile: null,
      maxScore: 100,
    },
    manifestJson: {
      app_id: "template-app",
      version: "0.1.0",
      title: "Template App",
      entrypoint: "/dist/index.html",
      preview: {
        fixtures_file: "/preview/fixtures.json",
        tests_file: "/preview/tests.json",
      },
      authoring: {
        kind: "browser_autograder",
        grader_spec_files: ["/grading/specs/checks.spec.js"],
        evidence_example_file: "/evidence/example-output.json",
      },
    },
    artifact: {
      snapshotRoot: TEMPLATE_SNAPSHOT_ROOT,
      manifestPath: `${TEMPLATE_SNAPSHOT_ROOT}/manifest.json`,
      entrypointPath: `${TEMPLATE_SNAPSHOT_ROOT}/dist/index.html`,
      digest: "sha256:template-app-approved-authoring-preview",
    },
  });
}

function buildTemplateAuthoringDraft(): AuthoringDraftRecord {
  return {
    draftId: DRAFT_ID,
    packageVersionId: 101,
    appId: "template-app",
    packageVersion: "0.1.0",
    packageTitle: "Template App",
    authoringKind: "browser_autograder",
    authoringPaths: [
      "/grading/specs/checks.spec.js",
      "/evidence/example-output.json",
    ],
    baseSnapshotRoot: TEMPLATE_SNAPSHOT_ROOT,
    latestPromptText: "Write a browser_autograder check for missing alt text.",
    latestGenerationNotes: ["Added alt text coverage assertions."],
    savedSource: "ai",
    lastPreviewedAt: null,
    createdAt: "2026-04-08T16:50:00Z",
    updatedAt: "2026-04-08T16:52:00Z",
    files: [],
  };
}

function buildTemplateAuthoringDraftFile(): AuthoringDraftFileRecord {
  return {
    draftId: DRAFT_ID,
    relativePath: "/grading/specs/checks.spec.js",
    contents: SAVED_DRAFT_SPEC,
    sequence: 1,
  };
}
