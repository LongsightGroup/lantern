import type {
  AppGenerationValidationFinding,
  AppWriterStarterId,
  AppWriterWorkspaceFile,
} from './types.ts';
import { hasStylesheetLink } from './html_inspection.ts';
import { LANTERN_APP_CSS } from '../styles/lantern_app_css.ts';
import { PICO_CSS } from '../styles/pico_css.ts';

const REQUIRED_BASELINE_FILES = [
  'manifest.json',
  'dist/index.html',
  'dist/pico.min.css',
  'dist/lantern-app.css',
  'dist/app.css',
  'dist/app.js',
  'content/activity.json',
  'preview/fixtures.json',
  'preview/tests.json',
] as const;

const PINNED_STYLE_FILES: Readonly<Record<string, string>> = {
  'dist/pico.min.css': PICO_CSS,
  'dist/lantern-app.css': LANTERN_APP_CSS,
};

export function normalizeWorkspaceFiles(
  files: readonly AppWriterWorkspaceFile[],
  findings: AppGenerationValidationFinding[],
): Map<string, AppWriterWorkspaceFile> {
  const normalizedFiles = new Map<string, AppWriterWorkspaceFile>();

  for (const file of files) {
    const normalizedPath = normalizeGeneratedPath(file.path);

    if (normalizedPath === null) {
      findings.push({
        code: 'file_path_invalid',
        severity: 'error',
        message: `Generated file path ${file.path} must stay inside the virtual workspace.`,
        file: file.path,
        field: null,
        fix:
          'Use a relative package path without leading slash, backslash, or parent-directory segments.',
        detail: {},
      });
      continue;
    }

    if (normalizedFiles.has(normalizedPath)) {
      findings.push({
        code: 'file_path_duplicate',
        severity: 'error',
        message: `Generated file path ${normalizedPath} appears more than once.`,
        file: normalizedPath,
        field: null,
        fix: 'Return each package file at most once.',
        detail: {},
      });
      continue;
    }

    normalizedFiles.set(normalizedPath, {
      path: normalizedPath,
      contents: file.contents,
    });
  }

  return normalizedFiles;
}

export function validateRequiredFiles(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  return REQUIRED_BASELINE_FILES.flatMap((path) => {
    if (files.has(path)) {
      return [];
    }

    return [
      {
        code: 'required_file_missing',
        severity: 'error' as const,
        message: `Generated package must include ${path}.`,
        file: path,
        field: null,
        fix: `Add ${path} to the generated package files.`,
        detail: {},
      },
    ];
  });
}

export function validateAllowedPaths(
  starterId: AppWriterStarterId,
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const findings: AppGenerationValidationFinding[] = [];

  for (const path of files.keys()) {
    if (isAllowedPath(starterId, path)) {
      continue;
    }

    findings.push({
      code: 'file_path_not_allowed',
      severity: 'error',
      message: `Generated file ${path} is outside the ${starterId} file allowlist.`,
      file: path,
      field: null,
      fix: 'Return only files in the Lantern starter allowlist.',
      detail: {
        starterId,
      },
    });
  }

  return findings;
}

export function validatePinnedStyleFiles(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const findings: AppGenerationValidationFinding[] = [];

  for (const [path, expectedContents] of Object.entries(PINNED_STYLE_FILES)) {
    const file = files.get(path);

    if (file === undefined || file.contents === expectedContents) {
      continue;
    }

    findings.push({
      code: 'pinned_style_file_modified',
      severity: 'error',
      message: `${path} is a Lantern-owned reviewed stylesheet and must not be modified.`,
      file: path,
      field: null,
      fix:
        `Restore ${path} to the pinned Lantern-provided stylesheet and put app-specific styles in dist/app.css.`,
      detail: {},
    });
  }

  return findings;
}

export function validateDesignContract(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const html = files.get('dist/index.html')?.contents;

  if (html === undefined) {
    return [];
  }

  const findings: AppGenerationValidationFinding[] = [];

  for (const href of ['./pico.min.css', './lantern-app.css', './app.css']) {
    if (hasStylesheetLink(html, href)) {
      continue;
    }

    findings.push({
      code: 'design_stylesheet_missing',
      severity: 'error',
      message: `Generated app shell must load ${href}.`,
      file: 'dist/index.html',
      field: null,
      fix: `Add <link rel="stylesheet" href="${href}"> inside dist/index.html <head>.`,
      detail: {
        href,
      },
    });
  }

  if (!hasLanternAppRoot(html)) {
    findings.push({
      code: 'design_app_shell_missing',
      severity: 'error',
      message: 'Generated app shell must keep the Lantern app root.',
      file: 'dist/index.html',
      field: null,
      fix:
        'Use <main id="app" class="ln-app" data-test="app-root"></main> as the reviewed app root.',
      detail: {},
    });
  }

  return findings;
}

export function isStaticSourceFile(path: string): boolean {
  return (
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.json')
  );
}

export function isPinnedStylePath(path: string): boolean {
  return Object.hasOwn(PINNED_STYLE_FILES, path);
}

function normalizeGeneratedPath(path: string): string | null {
  const trimmed = path.trim();

  if (
    trimmed === '' ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.split('/').includes('..')
  ) {
    return null;
  }

  return trimmed.replaceAll(/\/+/g, '/');
}

function isAllowedPath(starterId: AppWriterStarterId, path: string): boolean {
  if (REQUIRED_BASELINE_FILES.includes(path as (typeof REQUIRED_BASELINE_FILES)[number])) {
    return true;
  }

  if (/^dist\/[a-zA-Z0-9._-]+\.(?:html|js|css)$/.test(path)) {
    return true;
  }

  if (path === 'scoring/rubric.json') {
    return true;
  }

  if (starterId === 'browser-autograder') {
    return (
      /^grading\/specs\/[a-zA-Z0-9._-]+\.js$/.test(path) || path === 'evidence/example-output.json'
    );
  }

  return false;
}

function hasLanternAppRoot(html: string): boolean {
  return /<main\b(?=[^>]*\bclass=["'][^"']*\bln-app\b[^"']*["'])(?=[^>]*\bdata-test=["']app-root["'])[^>]*>/i
    .test(
      html,
    );
}
