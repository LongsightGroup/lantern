import type { PackageSnapshotStore } from './snapshot_store.ts';
import type { PackageVersionRecord } from './types.ts';

export type PackageFileDiffKind = 'added' | 'removed' | 'modified' | 'unchanged';

export interface PackageFileDiff {
  path: string;
  kind: PackageFileDiffKind;
  baseByteLength: number;
  targetByteLength: number;
  byteDelta: number;
  text: boolean;
  snippet: string[];
}

export interface PackageManifestFieldDiff {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export interface PackageVersionDiff {
  baseVersion: PackageVersionRecord;
  targetVersion: PackageVersionRecord;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  manifest: PackageManifestFieldDiff[];
  files: PackageFileDiff[];
}

interface SnapshotFile {
  path: string;
  bytes: Uint8Array;
}

const DEFAULT_SNIPPET_LINES = 12;
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

export async function comparePackageVersions(input: {
  snapshotStore: PackageSnapshotStore;
  baseVersion: PackageVersionRecord;
  targetVersion: PackageVersionRecord;
  maxSnippetLines?: number;
}): Promise<PackageVersionDiff> {
  const [baseFiles, targetFiles] = await Promise.all([
    readSnapshotFiles(input.snapshotStore, input.baseVersion.artifact.snapshotRoot),
    readSnapshotFiles(input.snapshotStore, input.targetVersion.artifact.snapshotRoot),
  ]);
  const maxSnippetLines = input.maxSnippetLines ?? DEFAULT_SNIPPET_LINES;
  const files = compareSnapshotFiles({
    baseFiles,
    targetFiles,
    maxSnippetLines,
  });

  return {
    baseVersion: input.baseVersion,
    targetVersion: input.targetVersion,
    summary: summarizeFileDiffs(files),
    manifest: compareManifestFields(input.baseVersion, input.targetVersion),
    files,
  };
}

function compareSnapshotFiles(input: {
  baseFiles: SnapshotFile[];
  targetFiles: SnapshotFile[];
  maxSnippetLines: number;
}): PackageFileDiff[] {
  const baseFileMap = new Map(input.baseFiles.map((file) => [file.path, file]));
  const targetFileMap = new Map(input.targetFiles.map((file) => [file.path, file]));
  const paths = [...new Set([...baseFileMap.keys(), ...targetFileMap.keys()])].sort();

  return paths.map((path) => {
    const baseFile = baseFileMap.get(path) ?? null;
    const targetFile = targetFileMap.get(path) ?? null;

    if (baseFile === null && targetFile !== null) {
      return buildFileDiff({
        path,
        kind: 'added',
        baseBytes: new Uint8Array(),
        targetBytes: targetFile.bytes,
        maxSnippetLines: input.maxSnippetLines,
      });
    }

    if (baseFile !== null && targetFile === null) {
      return buildFileDiff({
        path,
        kind: 'removed',
        baseBytes: baseFile.bytes,
        targetBytes: new Uint8Array(),
        maxSnippetLines: input.maxSnippetLines,
      });
    }

    if (baseFile === null || targetFile === null) {
      throw new Error(`Package diff could not resolve ${path}.`);
    }

    return buildFileDiff({
      path,
      kind: equalBytes(baseFile.bytes, targetFile.bytes) ? 'unchanged' : 'modified',
      baseBytes: baseFile.bytes,
      targetBytes: targetFile.bytes,
      maxSnippetLines: input.maxSnippetLines,
    });
  });
}

async function readSnapshotFiles(
  snapshotStore: PackageSnapshotStore,
  snapshotRoot: string,
): Promise<SnapshotFile[]> {
  const paths = await snapshotStore.listFiles(snapshotRoot);

  return await Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: await snapshotStore.readBytes(snapshotRoot, path),
    })),
  );
}

function buildFileDiff(input: {
  path: string;
  kind: PackageFileDiffKind;
  baseBytes: Uint8Array;
  targetBytes: Uint8Array;
  maxSnippetLines: number;
}): PackageFileDiff {
  const baseText = decodeText(input.baseBytes);
  const targetText = decodeText(input.targetBytes);
  const text = baseText !== null && targetText !== null;

  return {
    path: input.path,
    kind: input.kind,
    baseByteLength: input.baseBytes.byteLength,
    targetByteLength: input.targetBytes.byteLength,
    byteDelta: input.targetBytes.byteLength - input.baseBytes.byteLength,
    text,
    snippet: text
      ? buildTextSnippet({
        kind: input.kind,
        baseText,
        targetText,
        maxSnippetLines: input.maxSnippetLines,
      })
      : [],
  };
}

function buildTextSnippet(input: {
  kind: PackageFileDiffKind;
  baseText: string;
  targetText: string;
  maxSnippetLines: number;
}): string[] {
  switch (input.kind) {
    case 'added':
      return takeLines(input.targetText, input.maxSnippetLines).map((line) => `+ ${line}`);
    case 'removed':
      return takeLines(input.baseText, input.maxSnippetLines).map((line) => `- ${line}`);
    case 'modified':
      return buildModifiedSnippet(input.baseText, input.targetText, input.maxSnippetLines);
    case 'unchanged':
      return [];
  }
}

function buildModifiedSnippet(
  baseText: string,
  targetText: string,
  maxSnippetLines: number,
): string[] {
  const baseLines = splitLines(baseText);
  const targetLines = splitLines(targetText);
  const maxLineCount = Math.max(baseLines.length, targetLines.length);
  let firstChangedIndex = 0;

  while (
    firstChangedIndex < maxLineCount &&
    (baseLines[firstChangedIndex] ?? null) === (targetLines[firstChangedIndex] ?? null)
  ) {
    firstChangedIndex += 1;
  }

  const start = Math.max(0, firstChangedIndex - 2);
  const lines: string[] = [];

  for (let index = start; index < maxLineCount && lines.length < maxSnippetLines; index += 1) {
    const before = baseLines[index] ?? null;
    const after = targetLines[index] ?? null;

    if (before === after && before !== null) {
      lines.push(`  ${before}`);
      continue;
    }

    if (before !== null && lines.length < maxSnippetLines) {
      lines.push(`- ${before}`);
    }

    if (after !== null && lines.length < maxSnippetLines) {
      lines.push(`+ ${after}`);
    }
  }

  return lines;
}

function compareManifestFields(
  baseVersion: PackageVersionRecord,
  targetVersion: PackageVersionRecord,
): PackageManifestFieldDiff[] {
  return [
    compareManifestField('Title', baseVersion.manifestJson, targetVersion.manifestJson, 'title'),
    compareManifestField(
      'Description',
      baseVersion.manifestJson,
      targetVersion.manifestJson,
      'description',
    ),
    compareManifestField(
      'Entrypoint',
      baseVersion.manifestJson,
      targetVersion.manifestJson,
      'entrypoint',
    ),
    {
      label: 'Capabilities',
      before: formatValue(baseVersion.capabilities),
      after: formatValue(targetVersion.capabilities),
      changed: formatValue(baseVersion.capabilities) !== formatValue(targetVersion.capabilities),
    },
    {
      label: 'Grading',
      before: formatValue(baseVersion.grading),
      after: formatValue(targetVersion.grading),
      changed: formatValue(baseVersion.grading) !== formatValue(targetVersion.grading),
    },
  ];
}

function compareManifestField(
  label: string,
  baseManifest: Record<string, unknown>,
  targetManifest: Record<string, unknown>,
  key: string,
): PackageManifestFieldDiff {
  const before = formatValue(baseManifest[key]);
  const after = formatValue(targetManifest[key]);

  return {
    label,
    before,
    after,
    changed: before !== after,
  };
}

function summarizeFileDiffs(files: PackageFileDiff[]): PackageVersionDiff['summary'] {
  return files.reduce(
    (summary, file) => ({
      ...summary,
      [file.kind]: summary[file.kind] + 1,
    }),
    {
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
    },
  );
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) {
    return null;
  }

  try {
    return TEXT_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

function takeLines(text: string, maxLines: number): string[] {
  return splitLines(text).slice(0, maxLines);
}

function splitLines(text: string): string[] {
  return text.replaceAll('\r\n', '\n').split('\n');
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return left.every((byte, index) => byte === right[index]);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return 'Not set';
  }

  return JSON.stringify(value);
}
