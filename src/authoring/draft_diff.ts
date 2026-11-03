import type { BrowserAutograderDraftFileInput } from './browser_autograder_draft_generator.ts';

export interface DraftDiffLine {
  kind: 'context' | 'removed' | 'added';
  value: string;
}

export interface DraftFileDiff {
  path: string;
  status: 'unchanged' | 'changed' | 'added' | 'removed';
  before: string;
  after: string;
  lines: DraftDiffLine[];
}

export function buildDraftDiff(input: {
  currentFiles: BrowserAutograderDraftFileInput[];
  generatedFiles: BrowserAutograderDraftFileInput[];
}): DraftFileDiff[] {
  const currentByPath = new Map(input.currentFiles.map((file) => [file.path, file.contents]));
  const generatedByPath = new Map(input.generatedFiles.map((file) => [file.path, file.contents]));
  const paths = new Set([...currentByPath.keys(), ...generatedByPath.keys()]);

  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) =>
      buildFileDiff({
        path,
        before: currentByPath.get(path) ?? '',
        after: generatedByPath.get(path) ?? '',
        hasBefore: currentByPath.has(path),
        hasAfter: generatedByPath.has(path),
      }),
    );
}

function buildFileDiff(input: {
  path: string;
  before: string;
  after: string;
  hasBefore: boolean;
  hasAfter: boolean;
}): DraftFileDiff {
  return {
    path: input.path,
    status: resolveDiffStatus(input.hasBefore, input.hasAfter, input.before, input.after),
    before: input.before,
    after: input.after,
    lines: buildDiffLines(input.before, input.after),
  };
}

function resolveDiffStatus(
  hasBefore: boolean,
  hasAfter: boolean,
  before: string,
  after: string,
): DraftFileDiff['status'] {
  if (!hasBefore && hasAfter) {
    return 'added';
  }

  if (hasBefore && !hasAfter) {
    return 'removed';
  }

  return before === after ? 'unchanged' : 'changed';
}

function buildDiffLines(before: string, after: string): DraftDiffLine[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  const lines: DraftDiffLine[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];

    if (beforeLine === afterLine && beforeLine !== undefined) {
      lines.push({ kind: 'context', value: beforeLine });
      continue;
    }

    if (beforeLine !== undefined) {
      lines.push({ kind: 'removed', value: beforeLine });
    }

    if (afterLine !== undefined) {
      lines.push({ kind: 'added', value: afterLine });
    }
  }

  return lines;
}

function splitLines(value: string): string[] {
  const normalized = value.replaceAll('\r\n', '\n');

  if (normalized === '') {
    return [];
  }

  return normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
}
