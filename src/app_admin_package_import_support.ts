import { requireTrimmedFormValue } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import { isReferencePackageId } from './package_review/intake.ts';
import {
  createMemoryPackageSource,
  type MemoryPackageSourceFile,
} from './package_review/package_source.ts';

export function requireSupportedReferencePackageId(value: FormDataEntryValue | null): string {
  const appId = requireTrimmedFormValue(value, "Choose one of Lantern's shipped reference apps.");

  if (!isReferencePackageId(appId)) {
    throw new Error("Choose one of Lantern's shipped reference apps.");
  }

  return appId;
}

export async function createUploadedPackageSource(formData: FormData) {
  return createMemoryPackageSource(await collectUploadedPackageFiles(formData));
}

export function statusForPackageImportError(error: unknown): 409 | 500 {
  if (error instanceof Error && error.message.includes('Package source file')) {
    return 409;
  }

  return statusForError(error);
}

async function collectUploadedPackageFiles(formData: FormData): Promise<MemoryPackageSourceFile[]> {
  const uploadedFiles = formData.getAll('packageFiles');

  if (uploadedFiles.length === 0) {
    throw new Error('Choose one reviewed package directory.');
  }

  const files = await Promise.all(
    uploadedFiles.map(async (entry) => {
      if (!(entry instanceof File)) {
        throw new TypeError('Choose one reviewed package directory.');
      }

      return {
        relativePath: readUploadedRelativePath(entry),
        bytes: new Uint8Array(await entry.arrayBuffer()),
      };
    }),
  );

  return normalizeUploadedPackageFiles(files);
}

function normalizeUploadedPackageFiles(
  files: MemoryPackageSourceFile[],
): MemoryPackageSourceFile[] {
  const normalizedFiles = files.map((file) => ({
    ...file,
    relativePath: file.relativePath.replaceAll('\\', '/').replace(/^\/+/, ''),
  }));

  if (normalizedFiles.some((file) => file.relativePath === 'manifest.json')) {
    return normalizedFiles;
  }

  const sharedRoot = getSharedUploadRoot(normalizedFiles);

  if (sharedRoot === null) {
    return normalizedFiles;
  }

  if (!normalizedFiles.some((file) => file.relativePath === `${sharedRoot}/manifest.json`)) {
    return normalizedFiles;
  }

  return normalizedFiles.map((file) => ({
    ...file,
    relativePath: file.relativePath.slice(sharedRoot.length + 1),
  }));
}

function getSharedUploadRoot(files: MemoryPackageSourceFile[]): string | null {
  const roots = new Set<string>();

  for (const file of files) {
    const separatorIndex = file.relativePath.indexOf('/');

    if (separatorIndex < 0) {
      return null;
    }

    roots.add(file.relativePath.slice(0, separatorIndex));
  }

  return roots.size === 1 ? ([...roots][0] ?? null) : null;
}

function readUploadedRelativePath(file: File): string {
  const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ??
    null;

  return webkitRelativePath && webkitRelativePath !== '' ? webkitRelativePath : file.name;
}
