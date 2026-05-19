import type { Capability } from '../../sdk/app-sdk.ts';
import { type ManifestReviewData, validateManifest } from '../package_review/manifest.ts';
import type { AppManifest } from '../package_review/manifest_contract.ts';
import { readManifestJsonFromSource } from '../package_review/manifest_files.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import { createFileSystemPackageSource } from '../package_review/package_source_fs.ts';
import { ensureLeadingSlash, trimLeadingSlash } from '../package_review/snapshot_path.ts';
import type { PreviewFixtureData, ValidationIssue } from '../package_review/types.ts';
import { parsePreviewFixtureData, readCanonicalContentPath } from '../preview/fixture.ts';

export interface LocalPreviewAssertion {
  selector: string;
  text?: string;
  contains?: string;
}

export interface LocalPreviewTest {
  name: string;
  assert: LocalPreviewAssertion;
}

export interface LocalAppValidationDiagnostic {
  code: string;
  severity: 'error';
  message: string;
  fix: string;
  field?: string;
  file?: string;
}

export interface LocalAppDiagnosticGroup {
  key: string;
  label: string;
  diagnostics: LocalAppValidationDiagnostic[];
}

export interface ValidatedLocalAppSourcePackage {
  manifest: AppManifest;
  authoring: AppManifest['authoring'] | null;
  reviewData: ManifestReviewData;
  entrypointHtml: string;
  contentPath: string | null;
  content: unknown;
  fixtureData: PreviewFixtureData;
  previewTests: LocalPreviewTest[];
}

export interface LocalAppPackage extends ValidatedLocalAppSourcePackage {
  rootPath: string;
  source: PackageSource;
}

export type LocalAppPreflightResult =
  | {
    ok: true;
    diagnostics: [];
    issues: [];
    warnings: string[];
    validatedPackage: ValidatedLocalAppSourcePackage;
  }
  | {
    ok: false;
    diagnostics: LocalAppValidationDiagnostic[];
    issues: string[];
    warnings: string[];
    validatedPackage?: undefined;
  };

export type LocalAppValidationResult =
  | (LocalAppPreflightResult & {
    ok: true;
    appPackage: LocalAppPackage;
  })
  | (LocalAppPreflightResult & {
    ok: false;
    appPackage?: undefined;
  });

class LocalAppDiagnosticError extends Error {
  readonly diagnostic: LocalAppValidationDiagnostic;

  constructor(diagnostic: LocalAppValidationDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

export async function preflightLocalAppPackageSource(
  source: PackageSource,
): Promise<LocalAppPreflightResult> {
  const manifestValidation = await validateManifest(source);

  if (!manifestValidation.ok) {
    return buildPreflightFailure(manifestValidation.issues.map(mapValidationIssueToDiagnostic));
  }

  const manifest = await readValidatedManifest(source);

  if (manifest === null) {
    return buildPreflightFailure([
      {
        code: 'invalid_manifest',
        severity: 'error',
        file: '/manifest.json',
        message: 'Lantern could not read manifest.json after validation.',
        fix: 'Fix manifest.json so it is valid JSON and retry validation.',
      },
    ]);
  }

  const diagnostics: LocalAppValidationDiagnostic[] = [];

  if (!manifest.preview) {
    diagnostics.push({
      code: 'missing_preview',
      severity: 'error',
      field: '/preview',
      message: 'Lantern authoring requires preview.fixtures_file and preview.tests_file.',
      fix:
        'Add preview.fixtures_file and preview.tests_file to manifest.json and point them at reviewed files under /preview.',
    });
  }

  const previewConfig = manifest.preview ?? null;

  const entrypointHtml = await captureDiagnostic(
    () =>
      loadTextFileFromSource(source, manifest.entrypoint, {
        code: 'entrypoint_unreadable',
        severity: 'error',
        field: '/entrypoint',
        file: manifest.entrypoint,
        message: `Entrypoint HTML ${manifest.entrypoint} could not be read from the package.`,
        fix:
          `Add ${manifest.entrypoint} to the reviewed package and keep /entrypoint pointed at that HTML file.`,
      }),
    diagnostics,
  );
  const fixtureData = previewConfig
    ? await captureDiagnostic(
      () => loadPreviewFixtureDataFromSource(source, previewConfig.fixtures_file),
      diagnostics,
    )
    : null;
  const previewTests = previewConfig
    ? await captureDiagnostic(
      () => loadPreviewTestsFromSource(source, previewConfig.tests_file),
      diagnostics,
    )
    : null;
  const contentPath = resolveContentPath(manifest, manifestValidation.reviewData.capabilities);
  const content = contentPath === null
    ? null
    : await captureDiagnostic(() => loadContentJsonFromSource(source, contentPath), diagnostics);

  if (
    diagnostics.length > 0 ||
    entrypointHtml === null ||
    fixtureData === null ||
    previewTests === null ||
    (contentPath !== null && content === null)
  ) {
    return buildPreflightFailure(diagnostics);
  }

  return {
    ok: true,
    diagnostics: [],
    issues: [],
    warnings: [],
    validatedPackage: {
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
}

export async function validateLocalAppPackage(rootPath: string): Promise<LocalAppValidationResult> {
  try {
    const resolvedRoot = await Deno.realPath(rootPath);
    const source = createFileSystemPackageSource(resolvedRoot);
    return await validateLocalAppPackageSource(source, resolvedRoot);
  } catch (error) {
    return buildValidationFailure([
      {
        code: 'local_validation_failed',
        severity: 'error',
        message: error instanceof Error ? error.message : 'Local app validation failed.',
        fix: 'Resolve the package-path problem and rerun Lantern validation.',
      },
    ]);
  }
}

export async function validateLocalAppPackageSource(
  source: PackageSource,
  rootPath = 'memory://lantern-app-package',
): Promise<LocalAppValidationResult> {
  const result = await preflightLocalAppPackageSource(source);

  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    appPackage: {
      rootPath,
      source,
      ...result.validatedPackage,
    },
  };
}

export function formatLocalAppDiagnostic(diagnostic: LocalAppValidationDiagnostic): string {
  return `${
    describeLocalAppDiagnosticLabel(
      diagnostic,
    )
  }: ${diagnostic.message} Fix: ${diagnostic.fix}`;
}

export function describeLocalAppDiagnosticLabel(
  diagnostic: Pick<LocalAppValidationDiagnostic, 'field' | 'file'>,
): string {
  if (typeof diagnostic.file === 'string') {
    return `File ${diagnostic.file}`;
  }

  if (typeof diagnostic.field === 'string') {
    return `Manifest ${diagnostic.field}`;
  }

  return 'Package';
}

export function groupLocalAppDiagnostics(
  diagnostics: readonly LocalAppValidationDiagnostic[],
): LocalAppDiagnosticGroup[] {
  const groups = new Map<string, LocalAppDiagnosticGroup>();

  for (const diagnostic of diagnostics) {
    const key = diagnostic.file
      ? `file:${diagnostic.file}`
      : diagnostic.field
      ? `field:${diagnostic.field}`
      : 'package';
    const label = describeLocalAppDiagnosticLabel(diagnostic);
    const existing = groups.get(key);

    if (existing) {
      existing.diagnostics.push(diagnostic);
      continue;
    }

    groups.set(key, {
      key,
      label,
      diagnostics: [diagnostic],
    });
  }

  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
}

async function readValidatedManifest(source: PackageSource): Promise<AppManifest | null> {
  const manifestJson = await readManifestJsonFromSource(source);

  if ('issues' in manifestJson) {
    return null;
  }

  return manifestJson.value as AppManifest;
}

function resolveContentPath(manifest: AppManifest, capabilities: Capability[]): string | null {
  if (!capabilities.includes('read_activity_content')) {
    return null;
  }

  return ensureLeadingSlash(
    readCanonicalContentPath(manifest as unknown as Record<string, unknown>),
  );
}

async function loadContentJsonFromSource(
  source: PackageSource,
  contentPath: string,
): Promise<unknown> {
  const text = await loadTextFileFromSource(source, contentPath, {
    code: 'content_file_missing',
    severity: 'error',
    file: contentPath,
    message: `App content file ${contentPath} could not be read from the package.`,
    fix:
      `Add ${contentPath} to the reviewed package or update content_files to point at an existing JSON file.`,
  });

  return parseJsonText(text, {
    code: 'content_invalid_json',
    severity: 'error',
    file: contentPath,
    message: `App content file ${contentPath} must be valid JSON.`,
    fix: `Replace ${contentPath} with valid JSON content.`,
  });
}

async function loadPreviewFixtureDataFromSource(
  source: PackageSource,
  fixturesFile: string,
): Promise<PreviewFixtureData> {
  const text = await loadTextFileFromSource(source, fixturesFile, {
    code: 'preview_fixtures_missing',
    severity: 'error',
    field: '/preview/fixtures_file',
    file: fixturesFile,
    message: `Preview fixtures file ${fixturesFile} could not be read from the package.`,
    fix:
      `Add ${fixturesFile} to the reviewed package or update preview.fixtures_file to point at an existing JSON file.`,
  });
  const parsed = parseJsonText(text, {
    code: 'preview_fixtures_invalid_json',
    severity: 'error',
    field: '/preview/fixtures_file',
    file: fixturesFile,
    message: `Preview fixtures file ${fixturesFile} must be valid JSON.`,
    fix: `Replace ${fixturesFile} with valid JSON.`,
  });

  try {
    return parsePreviewFixtureData(parsed);
  } catch (error) {
    throw new LocalAppDiagnosticError({
      code: 'preview_fixtures_invalid_shape',
      severity: 'error',
      field: '/preview/fixtures_file',
      file: fixturesFile,
      message: error instanceof Error
        ? error.message
        : `Preview fixtures file ${fixturesFile} is not valid for Lantern authoring.`,
      fix:
        `Add launch.user_role, launch.course_id, launch.activity_id, attempt_id, and local_state to ${fixturesFile}.`,
    });
  }
}

async function loadPreviewTestsFromSource(
  source: PackageSource,
  testsFile: string,
): Promise<LocalPreviewTest[]> {
  const text = await loadTextFileFromSource(source, testsFile, {
    code: 'preview_tests_missing',
    severity: 'error',
    field: '/preview/tests_file',
    file: testsFile,
    message: `Preview tests file ${testsFile} could not be read from the package.`,
    fix:
      `Add ${testsFile} to the reviewed package or update preview.tests_file to point at an existing JSON file.`,
  });
  const parsed = parseJsonText(text, {
    code: 'preview_tests_invalid_json',
    severity: 'error',
    field: '/preview/tests_file',
    file: testsFile,
    message: `Preview tests file ${testsFile} must be valid JSON.`,
    fix: `Replace ${testsFile} with valid JSON.`,
  });

  return parsePreviewTests(parsed, testsFile);
}

async function loadTextFileFromSource(
  source: PackageSource,
  filePath: string,
  diagnostic: LocalAppValidationDiagnostic,
): Promise<string> {
  try {
    const text = await source.readText(trimLeadingSlash(filePath));

    if (text === null) {
      throw new LocalAppDiagnosticError(diagnostic);
    }

    return text;
  } catch (error) {
    if (error instanceof LocalAppDiagnosticError) {
      throw error;
    }

    throw new LocalAppDiagnosticError(diagnostic);
  }
}

function parseJsonText<T>(text: string, diagnostic: LocalAppValidationDiagnostic): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LocalAppDiagnosticError(diagnostic);
  }
}

function parsePreviewTests(value: unknown, testsFile: string): LocalPreviewTest[] {
  if (!Array.isArray(value)) {
    throw new LocalAppDiagnosticError({
      code: 'preview_tests_not_array',
      severity: 'error',
      field: '/preview/tests_file',
      file: testsFile,
      message: 'Preview tests file must be a JSON array.',
      fix: `Replace ${testsFile} with a JSON array of named preview assertions.`,
    });
  }

  if (value.length === 0) {
    throw new LocalAppDiagnosticError({
      code: 'preview_tests_empty',
      severity: 'error',
      field: '/preview/tests_file',
      file: testsFile,
      message: 'Preview tests file must contain at least one named assertion.',
      fix: `Add at least one named preview test to ${testsFile}.`,
    });
  }

  const seenNames = new Set<string>();

  return value.map((candidate, index) => {
    const parsed = parsePreviewTest(candidate, index, testsFile);

    if (seenNames.has(parsed.name)) {
      throw new LocalAppDiagnosticError({
        code: 'preview_test_duplicate_name',
        severity: 'error',
        field: '/preview/tests_file',
        file: testsFile,
        message: `Preview test "${parsed.name}" appears more than once.`,
        fix: `Rename duplicate preview tests in ${testsFile} so each test name is unique.`,
      });
    }

    seenNames.add(parsed.name);

    return parsed;
  });
}

function parsePreviewTest(value: unknown, index: number, testsFile: string): LocalPreviewTest {
  const record = requireRecord(
    value,
    createFileDiagnostic(
      'preview_test_invalid_record',
      testsFile,
      `Preview test ${index + 1} must be a JSON object.`,
      `Replace item ${index + 1} in ${testsFile} with a JSON object containing name and assert.`,
      '/preview/tests_file',
    ),
  );
  const name = requireString(
    record.name,
    createFileDiagnostic(
      'preview_test_missing_name',
      testsFile,
      `Preview test ${index + 1} name is required.`,
      `Add a non-empty name to item ${index + 1} in ${testsFile}.`,
      '/preview/tests_file',
    ),
  );
  const assertRecord = requireRecord(
    record.assert,
    createFileDiagnostic(
      'preview_test_missing_assert',
      testsFile,
      `Preview test ${name} must define an assert object.`,
      `Add an assert object with selector text to preview test "${name}" in ${testsFile}.`,
      '/preview/tests_file',
    ),
  );
  const selector = requireString(
    assertRecord.selector,
    createFileDiagnostic(
      'preview_test_missing_selector',
      testsFile,
      `Preview test ${name} selector is required.`,
      `Add assert.selector to preview test "${name}" in ${testsFile}.`,
      '/preview/tests_file',
    ),
  );
  const text = readOptionalString(
    assertRecord.text,
    createFileDiagnostic(
      'preview_test_invalid_text',
      testsFile,
      `Preview test ${name} text must be a string.`,
      `Set assert.text in preview test "${name}" to a non-empty string or remove it.`,
      '/preview/tests_file',
    ),
  );
  const contains = readOptionalString(
    assertRecord.contains,
    createFileDiagnostic(
      'preview_test_invalid_contains',
      testsFile,
      `Preview test ${name} contains must be a string.`,
      `Set assert.contains in preview test "${name}" to a non-empty string or remove it.`,
      '/preview/tests_file',
    ),
  );

  if (text !== undefined && contains !== undefined) {
    throw new LocalAppDiagnosticError(
      createFileDiagnostic(
        'preview_test_ambiguous_text_match',
        testsFile,
        `Preview test ${name} must choose text or contains, not both.`,
        `Keep only one of assert.text or assert.contains in preview test "${name}" inside ${testsFile}.`,
        '/preview/tests_file',
      ),
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

async function captureDiagnostic<T>(
  loader: () => Promise<T>,
  diagnostics: LocalAppValidationDiagnostic[],
): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof LocalAppDiagnosticError) {
      diagnostics.push(error.diagnostic);
      return null;
    }

    throw error;
  }
}

function buildPreflightFailure(
  diagnostics: LocalAppValidationDiagnostic[],
): LocalAppPreflightResult {
  return {
    ok: false,
    diagnostics,
    issues: diagnostics.map(formatLocalAppDiagnostic),
    warnings: [],
  };
}

function buildValidationFailure(
  diagnostics: LocalAppValidationDiagnostic[],
): LocalAppValidationResult {
  return {
    ok: false,
    diagnostics,
    issues: diagnostics.map(formatLocalAppDiagnostic),
    warnings: [],
  };
}

function mapValidationIssueToDiagnostic(issue: ValidationIssue): LocalAppValidationDiagnostic {
  const missingPath = issue.keyword === 'missing_file'
    ? issue.message.match(/Referenced file ([^ ]+) is missing/)?.[1]
    : undefined;

  return {
    code: issue.keyword,
    severity: issue.severity,
    field: issue.field,
    ...(missingPath === undefined ? {} : { file: missingPath }),
    message: issue.message,
    fix: fixValidationIssue(issue),
  };
}

function fixValidationIssue(issue: ValidationIssue): string {
  if (issue.keyword === 'missing_file') {
    const missingPath = issue.message.match(/Referenced file ([^ ]+) is missing/)?.[1];

    return missingPath
      ? `Add ${missingPath} to the reviewed package or update ${issue.field} to point at an existing file.`
      : `Add the missing reviewed file or update ${issue.field} to point at an existing file.`;
  }

  if (issue.keyword === 'required') {
    return `Add ${issue.field} to manifest.json with a value that satisfies Lantern's reviewed package contract.`;
  }

  if (issue.keyword === 'additionalProperties') {
    return 'Remove the unsupported field from manifest.json.';
  }

  if (issue.keyword === 'invalid_json') {
    return 'Fix manifest.json so it contains valid JSON.';
  }

  if (issue.field === '/entrypoint') {
    return 'Update /entrypoint in manifest.json so it points at a reviewed HTML file under /dist.';
  }

  return `Update manifest.json so ${issue.field} satisfies Lantern's reviewed package contract.`;
}

function createFileDiagnostic(
  code: string,
  file: string,
  message: string,
  fix: string,
  field?: string,
): LocalAppValidationDiagnostic {
  return {
    code,
    severity: 'error',
    file,
    ...(field === undefined ? {} : { field }),
    message,
    fix,
  };
}

function requireRecord(
  value: unknown,
  diagnostic: LocalAppValidationDiagnostic,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalAppDiagnosticError(diagnostic);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, diagnostic: LocalAppValidationDiagnostic): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LocalAppDiagnosticError(diagnostic);
  }

  return value.trim();
}

function readOptionalString(
  value: unknown,
  diagnostic: LocalAppValidationDiagnostic,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new LocalAppDiagnosticError(diagnostic);
  }

  return value.trim();
}
