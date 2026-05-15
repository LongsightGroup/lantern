import type {
  AppGenerationValidationFinding,
  AppPackageSourceCompiler,
  AppWriterWorkspaceFile,
} from './types.ts';

export function hasTypeScriptAuthoringSource(
  files: readonly Pick<AppWriterWorkspaceFile, 'path'>[],
): boolean {
  return files.some((file) => normalizeSourcePath(file.path).startsWith('source/'));
}

export function createUnavailableAppPackageSourceCompiler(
  message = APP_PACKAGE_SOURCE_COMPILER_UNAVAILABLE_MESSAGE,
): AppPackageSourceCompiler {
  return {
    compile(_input) {
      return Promise.resolve({
        files: [],
        notes: [],
        validationFindings: [buildSourceCompilerUnavailableFinding(message)],
      });
    },
  };
}

export const APP_PACKAGE_SOURCE_COMPILER_UNAVAILABLE_MESSAGE =
  'Lantern TypeScript app source compilation is not configured.';

function buildSourceCompilerUnavailableFinding(message: string): AppGenerationValidationFinding {
  return {
    code: 'typescript_compiler_unavailable',
    severity: 'error',
    message,
    file: null,
    field: null,
    fix: 'Configure a platform-owned TypeScript source compiler or generate reviewed browser assets directly.',
    detail: {},
  };
}

function normalizeSourcePath(path: string): string {
  return path
    .trim()
    .replaceAll(/^\/+|\/+$/g, '')
    .replaceAll(/\/+/g, '/');
}
