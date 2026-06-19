import type { AppWriterWorkspaceFile, AppWriterWorkspaceFileRole } from './types.ts';

export function getWorkspaceFileRole(file: AppWriterWorkspaceFile): AppWriterWorkspaceFileRole {
  return inferProtectedWorkspaceFileRole(file.path) ?? file.role ?? 'package';
}

export function selectPackageWorkspaceFiles(
  files: readonly AppWriterWorkspaceFile[],
): AppWriterWorkspaceFile[] {
  return files
    .filter((file) => getWorkspaceFileRole(file) === 'package')
    .map((file) => ({ ...file, role: 'package' }));
}

export function selectNonPackageWorkspaceFiles(
  files: readonly AppWriterWorkspaceFile[],
): AppWriterWorkspaceFile[] {
  return files
    .filter((file) => getWorkspaceFileRole(file) !== 'package')
    .map((file) => ({ ...file, role: getWorkspaceFileRole(file) }));
}

export function selectProtectedWorkspaceContextFiles(
  files: readonly AppWriterWorkspaceFile[],
): AppWriterWorkspaceFile[] {
  return files
    .filter((file) => {
      const role = getWorkspaceFileRole(file);

      return role === 'instruction' || role === 'contract';
    })
    .map((file) => ({ ...file, role: getWorkspaceFileRole(file) }));
}

export function mergeWorkspaceFiles(
  baseFiles: readonly AppWriterWorkspaceFile[],
  nextFiles: readonly AppWriterWorkspaceFile[],
): AppWriterWorkspaceFile[] {
  const files = new Map(baseFiles.map((file) => [file.path, normalizeWorkspaceFile(file)]));

  for (const file of nextFiles) {
    files.set(file.path, normalizeWorkspaceFile(file, files.get(file.path)));
  }

  return [...files.values()];
}

function normalizeWorkspaceFile(
  file: AppWriterWorkspaceFile,
  existingFile?: AppWriterWorkspaceFile,
): AppWriterWorkspaceFile {
  const protectedRole = inferProtectedWorkspaceFileRole(file.path);

  return {
    path: file.path,
    contents: file.contents,
    role: protectedRole ?? file.role ?? existingFile?.role ?? 'package',
  };
}

function inferProtectedWorkspaceFileRole(path: string): AppWriterWorkspaceFileRole | null {
  if (path === 'AGENTS.md') {
    return 'instruction';
  }

  if (path.startsWith('.lantern/contracts/')) {
    return 'contract';
  }

  if (path.startsWith('.lantern/') || path.startsWith('source/')) {
    return 'evidence';
  }

  return null;
}
