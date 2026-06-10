import { type AppWriterContextSelection, readAppWriterRevisionContext } from './context.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationInput,
  AppPackageSourceCompiler,
  AppWriterAuthoringMode,
  AppWriterWorkspaceFile,
} from './types.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageSnapshotStore } from '../package_review/snapshot_store.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { LANTERN_APP_CSS } from '../styles/lantern_app_css.ts';
import { PICO_CSS } from '../styles/pico_css.ts';

export function buildContextSelectionFromRun(
  run: AppGenerationRunRecord,
): AppWriterContextSelection {
  if (run.selectedStarterId === null) {
    throw new Error(`App generation run ${run.generationId} has no selected starter.`);
  }

  return {
    starterId: run.selectedStarterId,
    selectedContext: {
      ...run.selectedContext,
      authoringMode: run.selectedContext.authoringMode,
    },
  };
}

export function targetVersionForContext(contextSelection: AppWriterContextSelection): string {
  return readAppWriterRevisionContext(contextSelection.selectedContext)?.targetVersion ?? '0.1.0';
}

export function buildGeneratorInputFromRun(
  run: Pick<
    AppGenerationRunRecord,
    | 'generationId'
    | 'ownerId'
    | 'promptText'
    | 'requestedAppId'
    | 'selectedStarterId'
    | 'selectedContext'
    | 'createdAt'
  >,
  contextSelection: AppWriterContextSelection,
): AppPackageGenerationInput {
  return {
    generationId: run.generationId,
    ownerId: run.ownerId,
    promptText: run.promptText,
    requestedAppId: run.requestedAppId,
    selectedStarterId: contextSelection.starterId,
    selectedContext: contextSelection.selectedContext,
    authoringMode: contextSelection.selectedContext.authoringMode,
    createdAt: run.createdAt,
  };
}

export function validateRevisionPackageIdentity(input: {
  contextSelection: AppWriterContextSelection;
  files: readonly AppWriterWorkspaceFile[];
}): AppGenerationValidationFinding[] {
  const revision = readAppWriterRevisionContext(input.contextSelection.selectedContext);

  if (revision === null) {
    return [];
  }

  const manifestFile = selectPackageWorkspaceFiles(input.files).find(
    (file) => file.path === 'manifest.json',
  );

  if (manifestFile === undefined) {
    return [];
  }

  let manifest: Record<string, unknown>;

  try {
    const parsed = JSON.parse(manifestFile.contents) as unknown;

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [];
    }

    manifest = parsed as Record<string, unknown>;
  } catch {
    return [];
  }

  const findings: AppGenerationValidationFinding[] = [];

  if (manifest.app_id !== revision.sourceAppId) {
    findings.push({
      code: 'revision_manifest_app_id_changed',
      severity: 'error',
      message: `Revision manifest app_id must remain ${revision.sourceAppId}.`,
      file: 'manifest.json',
      field: '/app_id',
      fix: `Set manifest app_id back to ${revision.sourceAppId}.`,
      detail: {
        expected: revision.sourceAppId,
        actual: typeof manifest.app_id === 'string' ? manifest.app_id : null,
      },
    });
  }

  if (manifest.version !== revision.targetVersion) {
    findings.push({
      code: 'revision_manifest_version_mismatch',
      severity: 'error',
      message: `Revision manifest version must be ${revision.targetVersion}.`,
      file: 'manifest.json',
      field: '/version',
      fix: `Set manifest version to ${revision.targetVersion}.`,
      detail: {
        sourceVersion: revision.sourceVersion,
        expected: revision.targetVersion,
        actual: typeof manifest.version === 'string' ? manifest.version : null,
      },
    });
  }

  return findings;
}

export async function buildRevisionSourceFilesIfNeeded(input: {
  repository: Partial<Pick<PackageReviewRepository, 'getPackageVersionById'>>;
  packageSnapshotStore: PackageSnapshotStore | undefined;
  contextSelection: AppWriterContextSelection;
}): Promise<{ revisionSourceFiles?: AppWriterWorkspaceFile[] }> {
  const revision = readAppWriterRevisionContext(input.contextSelection.selectedContext);

  if (revision === null) {
    return {};
  }

  if (input.packageSnapshotStore === undefined) {
    throw new Error(
      'App Writer revision initialization requires package snapshot storage so Lantern can load the previous reviewed package.',
    );
  }

  const getPackageVersionById = input.repository.getPackageVersionById;

  if (getPackageVersionById === undefined) {
    throw new Error(
      'App Writer revision initialization requires package version lookup so Lantern can load the previous package.',
    );
  }

  const packageVersion = await getPackageVersionById(revision.sourcePackageVersionId);

  if (packageVersion === null) {
    throw new Error(
      `Revision source package version ${revision.sourcePackageVersionId} was not found.`,
    );
  }

  if (
    packageVersion.appId !== revision.sourceAppId ||
    packageVersion.version !== revision.sourceVersion
  ) {
    throw new Error(
      `Revision source package ${packageVersion.appId}@${packageVersion.version} did not match the recorded source ${revision.sourceAppId}@${revision.sourceVersion}.`,
    );
  }

  const files = await loadRevisionSourcePackageFiles({
    packageSnapshotStore: input.packageSnapshotStore,
    packageVersion,
    targetVersion: revision.targetVersion,
  });

  return { revisionSourceFiles: files };
}

async function loadRevisionSourcePackageFiles(input: {
  packageSnapshotStore: PackageSnapshotStore;
  packageVersion: PackageVersionRecord;
  targetVersion: string;
}): Promise<AppWriterWorkspaceFile[]> {
  const snapshotRoot = input.packageVersion.artifact.snapshotRoot;
  const paths = await input.packageSnapshotStore.listFiles(snapshotRoot);
  const files: AppWriterWorkspaceFile[] = [];
  const seenPaths = new Set<string>();

  for (const path of paths) {
    const bytes = await input.packageSnapshotStore.readBytes(snapshotRoot, path);
    const contents = decodeRevisionSourceFile({
      path,
      bytes,
    });
    seenPaths.add(path);

    files.push({
      path,
      role: 'package',
      contents: rewriteRevisionSourceFile({
        path,
        contents,
        appId: input.packageVersion.appId,
        targetVersion: input.targetVersion,
      }),
    });
  }

  if (!files.some((file) => file.path === 'manifest.json')) {
    throw new Error(
      `Revision source package ${input.packageVersion.appId}@${input.packageVersion.version} is missing manifest.json.`,
    );
  }

  assertRevisionSourceFileExists({
    paths: seenPaths,
    packageVersion: input.packageVersion,
    path: 'dist/pico.min.css',
  });
  assertRevisionSourceFileExists({
    paths: seenPaths,
    packageVersion: input.packageVersion,
    path: 'dist/lantern-app.css',
  });
  assertRevisionSourceFileExists({
    paths: seenPaths,
    packageVersion: input.packageVersion,
    path: 'dist/app.css',
  });

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function assertRevisionSourceFileExists(input: {
  paths: ReadonlySet<string>;
  packageVersion: PackageVersionRecord;
  path: string;
}): void {
  if (input.paths.has(input.path)) {
    return;
  }

  throw new Error(
    `Revision source package ${input.packageVersion.appId}@${input.packageVersion.version} is missing required reviewed file ${input.path}.`,
  );
}

function rewriteRevisionSourceFile(input: {
  path: string;
  contents: string;
  appId: string;
  targetVersion: string;
}): string {
  switch (input.path) {
    case 'manifest.json':
      return rewriteRevisionManifest({
        contents: input.contents,
        appId: input.appId,
        targetVersion: input.targetVersion,
      });
    case 'dist/index.html':
      return ensureReviewedStylesheetLinks(input.contents);
    case 'dist/pico.min.css':
      return PICO_CSS;
    case 'dist/lantern-app.css':
      return LANTERN_APP_CSS;
    default:
      return input.contents;
  }
}

function ensureReviewedStylesheetLinks(html: string): string {
  const requiredLinks = [
    {
      href: './pico.min.css',
      html: '<link rel="stylesheet" href="./pico.min.css">',
    },
    {
      href: './lantern-app.css',
      html: '<link rel="stylesheet" href="./lantern-app.css">',
    },
    { href: './app.css', html: '<link rel="stylesheet" href="./app.css">' },
  ];
  const missingLinks = requiredLinks.filter((link) => !hasStylesheetLink(html, link.href));

  if (missingLinks.length === 0) {
    return html;
  }

  const insertion = missingLinks.map((link) => link.html).join('');
  const rewritten = html.replace(/<head([^>]*)>/i, `<head$1>${insertion}`);

  if (rewritten === html) {
    throw new Error('Revision source dist/index.html must contain a <head> element.');
  }

  return rewritten;
}

function hasStylesheetLink(html: string, href: string): boolean {
  const escapedHref = href.replace('.', '\\.');
  const optionalDotSlash = escapedHref.startsWith('\\./')
    ? `(?:\\./)?${escapedHref.slice(3)}`
    : escapedHref;
  return new RegExp(
    `<link\\b[^>]*\\brel=["']stylesheet["'][^>]*\\bhref=["']${optionalDotSlash}["']`,
    'i',
  ).test(html);
}

function decodeRevisionSourceFile(input: { path: string; bytes: Uint8Array }): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
  } catch {
    throw new Error(
      `Revision source package file ${input.path} is not UTF-8 text. App Writer revisions require text package files.`,
    );
  }
}

function rewriteRevisionManifest(input: {
  contents: string;
  appId: string;
  targetVersion: string;
}): string {
  const parsed = JSON.parse(input.contents) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Revision source manifest.json must be a JSON object.');
  }

  return `${
    JSON.stringify(
      {
        ...(parsed as Record<string, unknown>),
        app_id: input.appId,
        version: input.targetVersion,
      },
      null,
      2,
    )
  }\n`;
}

export function selectAuthoringModeForGeneration(
  sourceCompiler: AppPackageSourceCompiler | undefined,
): AppWriterAuthoringMode {
  return sourceCompiler?.supportsTypeScriptAuthoring === true ? 'typescript' : 'javascript';
}

export function readPlanningFromRun(
  run: AppGenerationRunRecord,
): AppGenerationPlanningResult | null {
  if (
    run.normalizedRequest === null ||
    run.appPlan === null ||
    run.selectedStarterId === null ||
    run.status === 'failed'
  ) {
    return null;
  }

  return {
    normalizedRequest: run.normalizedRequest,
    appPlan: run.appPlan,
    selectedStarterId: run.selectedStarterId,
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Using the existing Lantern app plan.',
      },
    ],
    notes: [...run.generationNotes],
  };
}
