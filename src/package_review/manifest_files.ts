import type { AppManifest } from './manifest_contract.ts';
import type { PackageSource } from './package_source.ts';
import type { ValidationIssue } from './types.ts';

export async function readManifestJsonFromSource(
  source: PackageSource,
  manifestPath = 'manifest.json',
): Promise<{ value: unknown } | { issues: ValidationIssue[] }> {
  let sourceText: string;

  try {
    const text = await source.readText(manifestPath);

    if (text === null) {
      return {
        issues: [createMissingFileIssue('/manifest.json', '/manifest.json')],
      };
    }

    sourceText = text;
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

export async function collectReferencedFileIssuesFromSource(
  source: PackageSource,
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

  if (manifest.authoring) {
    for (const [index, graderSpecPath] of manifest.authoring.grader_spec_files.entries()) {
      references.push({
        field: `/authoring/grader_spec_files/${index}`,
        path: graderSpecPath,
      });
    }

    references.push({
      field: '/authoring/evidence_example_file',
      path: manifest.authoring.evidence_example_file,
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
    const exists = await source.fileExists(trimLeadingSlash(reference.path));

    if (!exists) {
      issues.push(createMissingFileIssue(reference.field, reference.path));
    }
  }

  const entrypointPath = trimLeadingSlash(manifest.entrypoint);
  const entrypointHtml = await source.readText(entrypointPath);

  if (entrypointHtml !== null) {
    for (const assetUrl of listRootRelativeReviewedAssetUrls(entrypointHtml)) {
      issues.push({
        field: '/entrypoint',
        keyword: 'invalid_asset_path',
        severity: 'error',
        message: `Entrypoint HTML cannot use root-relative reviewed asset URL ${assetUrl}. Use a relative asset path instead.`,
      });
    }
  }

  const layoutEntrypointExists = await source.fileExists('dist/index.html');

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

function listRootRelativeReviewedAssetUrls(html: string): string[] {
  const urls = new Set<string>();

  for (const pattern of ROOT_RELATIVE_REVIEWED_ASSET_PATTERNS) {
    for (const match of html.matchAll(pattern)) {
      const relativePath = match[1];

      if (typeof relativePath === 'string' && relativePath !== '') {
        urls.add(`/${relativePath}`);
      }
    }
  }

  return [...urls];
}

const ROOT_RELATIVE_REVIEWED_ASSET_PATTERNS = [
  /<script\b[^>]*\bsrc=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<link\b[^>]*\bhref=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<img\b[^>]*\bsrc=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<source\b[^>]*\bsrc=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<audio\b[^>]*\bsrc=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<video\b[^>]*\bsrc=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<video\b[^>]*\bposter=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
  /<track\b[^>]*\bsrc=["']\/(?!\/)([^"'?#>]+(?:\?[^"'#>]*)?(?:#[^"'>]*)?)["'][^>]*>/gi,
];

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
