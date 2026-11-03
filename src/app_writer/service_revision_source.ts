import { type AppWriterContextSelection, readAppWriterRevisionContext } from './context.ts';
import { hasStylesheetLink } from './html_inspection.ts';
import type { AppWriterWorkspaceFile } from './types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageSnapshotStore } from '../package_review/snapshot_store.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { LANTERN_APP_CSS } from '../styles/lantern_app_css.ts';
import { PICO_CSS } from '../styles/pico_css.ts';

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
  const parsed: unknown = JSON.parse(input.contents);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Revision source manifest.json must be a JSON object.');
  }

  return `${JSON.stringify(
    {
      ...Object.fromEntries(Object.entries(parsed)),
      app_id: input.appId,
      version: input.targetVersion,
    },
    null,
    2,
  )}\n`;
}
