import type { AppManifest } from './manifest_contract.ts';
import type { ValidationIssue } from './types.ts';

export async function readManifestJson(
  manifestPath: string,
): Promise<{ value: unknown } | { issues: ValidationIssue[] }> {
  let sourceText: string;

  try {
    sourceText = await Deno.readTextFile(manifestPath);
  } catch {
    return {
      issues: [createMissingFileIssue('/manifest.json', '/manifest.json')],
    };
  }

  try {
    return {
      value: JSON.parse(sourceText),
    };
  } catch {
    return {
      issues: [
        {
          field: '/manifest.json',
          keyword: 'invalid_json',
          severity: 'error',
          message: 'Manifest must be valid JSON before Lantern can review it.',
        },
      ],
    };
  }
}

export async function collectReferencedFileIssues(
  sourceRoot: string,
  manifest: AppManifest,
): Promise<ValidationIssue[]> {
  const references: Array<{ field: string; path: string }> = [
    {
      field: '/entrypoint',
      path: manifest.entrypoint,
    },
  ];

  if (manifest.grading.rubric_file) {
    references.push({
      field: '/grading/rubric_file',
      path: manifest.grading.rubric_file,
    });
  }

  for (const [index, filePath] of (manifest.content_files ?? []).entries()) {
    references.push({
      field: `/content_files/${index}`,
      path: filePath,
    });
  }

  if (manifest.preview) {
    references.push({
      field: '/preview/fixtures_file',
      path: manifest.preview.fixtures_file,
    });
    references.push({
      field: '/preview/tests_file',
      path: manifest.preview.tests_file,
    });
  }

  if (manifest.icon) {
    references.push({
      field: '/icon',
      path: manifest.icon,
    });
  }

  const issues: ValidationIssue[] = [];

  for (const reference of references) {
    const exists = await fileExists(
      joinFileSystemPath(sourceRoot, trimLeadingSlash(reference.path)),
    );

    if (!exists) {
      issues.push(createMissingFileIssue(reference.field, reference.path));
    }
  }

  const layoutEntrypointExists = await fileExists(
    joinFileSystemPath(sourceRoot, 'dist', 'index.html'),
  );

  if (!layoutEntrypointExists) {
    issues.push({
      field: '/entrypoint',
      keyword: 'missing_file',
      severity: 'error',
      message: 'Package must include /dist/index.html for the reviewed app shell.',
    });
  }

  return issues;
}

function createMissingFileIssue(field: string, path: string): ValidationIssue {
  return {
    field,
    keyword: 'missing_file',
    severity: 'error',
    message: `Referenced file ${path} is missing from the package.`,
  };
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function joinFileSystemPath(...segments: string[]): string {
  if (segments.length === 0) {
    return '.';
  }

  const [firstSegment = '.', ...rest] = segments;
  let path = firstSegment.replace(/\/+$/, '');

  for (const segment of rest) {
    path = `${path}/${segment.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  }

  return path.replaceAll(/\/{2,}/g, '/');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }

    throw error;
  }
}
