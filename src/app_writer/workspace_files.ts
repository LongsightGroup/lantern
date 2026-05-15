import type { AppWriterWorkspaceFile, AppWriterWorkspaceFileRole } from './types.ts';

export function getWorkspaceFileRole(file: AppWriterWorkspaceFile): AppWriterWorkspaceFileRole {
  return file.role ?? 'package';
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
  return {
    path: file.path,
    contents: file.contents,
    role: file.role ?? existingFile?.role ?? 'package',
  };
}
