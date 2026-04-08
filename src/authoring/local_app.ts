import type { Capability } from "../../sdk/app-sdk.ts";
import {
  type ManifestReviewData,
  validateManifest,
} from "../package_review/manifest.ts";
import type { AppManifest } from "../package_review/manifest_contract.ts";
import { createFileSystemPackageSource } from "../package_review/package_source_fs.ts";
import {
  ensureLeadingSlash,
  joinSnapshotPath,
  trimLeadingSlash,
} from "../package_review/snapshot_path.ts";
import type { PreviewFixtureData } from "../package_review/types.ts";
import {
  parsePreviewFixtureData,
  readCanonicalContentPath,
} from "../preview/fixture.ts";

export interface LocalPreviewAssertion {
  selector: string;
  text?: string;
  contains?: string;
}

export interface LocalPreviewTest {
  name: string;
  assert: LocalPreviewAssertion;
}

export interface LocalAppPackage {
  rootPath: string;
  manifest: AppManifest;
  authoring: AppManifest["authoring"] | null;
  reviewData: ManifestReviewData;
  entrypointHtml: string;
  contentPath: string | null;
  content: unknown;
  fixtureData: PreviewFixtureData;
  previewTests: LocalPreviewTest[];
}

export interface LocalAppValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
  appPackage?: LocalAppPackage;
}

export async function validateLocalAppPackage(
  rootPath: string,
): Promise<LocalAppValidationResult> {
  const resolvedRoot = await Deno.realPath(rootPath);
  const source = createFileSystemPackageSource(resolvedRoot);
  const manifestValidation = await validateManifest(source);

  if (!manifestValidation.ok) {
    return {
      ok: false,
      issues: manifestValidation.issues.map(formatValidationIssue),
      warnings: [],
    };
  }

  try {
    const manifest = await readValidatedManifest(resolvedRoot);
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!manifest.preview) {
      issues.push(
        "manifest.preview.fixtures_file and manifest.preview.tests_file are required for Lantern authoring.",
      );
    }

    const entrypointHtml = await Deno.readTextFile(
      joinSnapshotPath(
        resolvedRoot,
        trimLeadingSlash(manifest.entrypoint),
        "App entrypoint must stay inside the package root.",
      ),
    );
    const fixtureData = manifest.preview
      ? await loadPreviewFixtureDataFromFile(
        resolvedRoot,
        manifest.preview.fixtures_file,
      )
      : null;
    const previewTests = manifest.preview
      ? await loadPreviewTestsFromFile(
        resolvedRoot,
        manifest.preview.tests_file,
      )
      : null;
    const contentPath = resolveContentPath(
      manifest,
      manifestValidation.reviewData.capabilities,
    );
    const content = contentPath === null
      ? null
      : await loadContentJsonFromFile(resolvedRoot, contentPath);

    if (issues.length > 0 || fixtureData === null || previewTests === null) {
      return {
        ok: false,
        issues,
        warnings,
      };
    }

    return {
      ok: true,
      issues: [],
      warnings,
      appPackage: {
        rootPath: resolvedRoot,
        manifest,
        authoring: manifest.authoring ?? null,
        reviewData: manifestValidation.reviewData,
        entrypointHtml,
        contentPath,
        content,
        fixtureData,
        previewTests,
      },
    };
  } catch (error) {
    return {
      ok: false,
      issues: [
        error instanceof Error ? error.message : "Local app validation failed.",
      ],
      warnings: [],
    };
  }
}

export function formatValidationIssue(
  input: { field: string; message: string },
): string {
  return `${input.field}: ${input.message}`;
}

async function readValidatedManifest(rootPath: string): Promise<AppManifest> {
  const manifestJson = JSON.parse(
    await Deno.readTextFile(`${rootPath}/manifest.json`),
  );

  if (
    !manifestJson || typeof manifestJson !== "object" ||
    Array.isArray(manifestJson)
  ) {
    throw new Error("manifest.json must be a JSON object.");
  }

  return manifestJson as AppManifest;
}

function resolveContentPath(
  manifest: AppManifest,
  capabilities: Capability[],
): string | null {
  if (!capabilities.includes("read_activity_content")) {
    return null;
  }

  return ensureLeadingSlash(
    readCanonicalContentPath(manifest as unknown as Record<string, unknown>),
  );
}

async function loadContentJsonFromFile(
  rootPath: string,
  contentPath: string,
): Promise<unknown> {
  return parseJsonFile(
    await Deno.readTextFile(
      joinSnapshotPath(
        rootPath,
        trimLeadingSlash(contentPath),
        "App content file must stay inside the package root.",
      ),
    ),
    `App content file ${contentPath} must be valid JSON.`,
  );
}

async function loadPreviewFixtureDataFromFile(
  rootPath: string,
  fixturesFile: string,
): Promise<PreviewFixtureData> {
  const text = await Deno.readTextFile(
    joinSnapshotPath(
      rootPath,
      trimLeadingSlash(fixturesFile),
      "Preview fixtures file must stay inside the package root.",
    ),
  );

  return parsePreviewFixtureData(
    parseJsonFile(
      text,
      `Preview fixtures file ${fixturesFile} must be valid JSON.`,
    ),
  );
}

async function loadPreviewTestsFromFile(
  rootPath: string,
  testsFile: string,
): Promise<LocalPreviewTest[]> {
  const text = await Deno.readTextFile(
    joinSnapshotPath(
      rootPath,
      trimLeadingSlash(testsFile),
      "Preview tests file must stay inside the package root.",
    ),
  );

  return parsePreviewTests(
    parseJsonFile(text, `Preview tests file ${testsFile} must be valid JSON.`),
  );
}

function parseJsonFile(text: string, message: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(message);
  }
}

function parsePreviewTests(value: unknown): LocalPreviewTest[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Preview tests file must be a JSON array.");
  }

  return value.map((candidate, index) => parsePreviewTest(candidate, index));
}

function parsePreviewTest(value: unknown, index: number): LocalPreviewTest {
  const record = requireRecord(
    value,
    `Preview test ${index + 1} must be a JSON object.`,
  );
  const name = requireString(
    record.name,
    `Preview test ${index + 1} name is required.`,
  );
  const assertRecord = requireRecord(
    record.assert,
    `Preview test ${name} must define an assert object.`,
  );
  const selector = requireString(
    assertRecord.selector,
    `Preview test ${name} selector is required.`,
  );
  const text = readOptionalString(
    assertRecord.text,
    `Preview test ${name} text must be a string.`,
  );
  const contains = readOptionalString(
    assertRecord.contains,
    `Preview test ${name} contains must be a string.`,
  );

  if (text !== undefined && contains !== undefined) {
    throw new Error(
      `Preview test ${name} must choose text or contains, not both.`,
    );
  }

  return {
    name,
    assert: {
      selector,
      ...(text === undefined ? {} : { text }),
      ...(contains === undefined ? {} : { contains }),
    },
  };
}

function requireRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function readOptionalString(
  value: unknown,
  message: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}
