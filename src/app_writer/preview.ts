import type { LocalPreviewAssertionRunResult } from '../authoring/local_preview_assertions.ts';
import type {
  AppGenerationValidationFinding,
  AppPackagePreviewer,
  AppWriterWorkspaceFile,
} from './types.ts';

export function createLocalAppPackagePreviewer(
  input: {
    settleTimeoutMs?: number;
  } = {},
): AppPackagePreviewer {
  return {
    async preview(previewInput) {
      const packageRoot = await materializeWorkspace(previewInput.files);

      try {
        const { runLocalPreviewAssertions } =
          await import('../authoring/local_preview_assertions.ts');
        const options =
          input.settleTimeoutMs === undefined ? {} : { settleTimeoutMs: input.settleTimeoutMs };

        return mapPreviewAssertionResult(await runLocalPreviewAssertions(packageRoot, options));
      } finally {
        await Deno.remove(packageRoot, { recursive: true });
      }
    },
  };
}

export function createUnavailableAppPackagePreviewer(
  message = APP_PACKAGE_PREVIEWER_UNAVAILABLE_MESSAGE,
): AppPackagePreviewer {
  return {
    preview(_input) {
      return Promise.reject(new Error(message));
    },
  };
}

export const APP_PACKAGE_PREVIEWER_UNAVAILABLE_MESSAGE =
  'Lantern app package preview is not configured. Bind a platform-owned previewer before saving generated apps.';

async function materializeWorkspace(files: readonly AppWriterWorkspaceFile[]): Promise<string> {
  const packageRoot = await Deno.makeTempDir({ prefix: 'lantern-generated-preview-' });

  try {
    for (const file of files) {
      const relativePath = normalizePreviewPath(file.path);
      const parent = parentPath(relativePath);

      if (parent !== '') {
        await Deno.mkdir(`${packageRoot}/${parent}`, { recursive: true });
      }

      await Deno.writeTextFile(`${packageRoot}/${relativePath}`, file.contents);
    }

    return packageRoot;
  } catch (error) {
    await Deno.remove(packageRoot, { recursive: true });
    throw error;
  }
}

function mapPreviewAssertionResult(
  result: LocalPreviewAssertionRunResult,
): AppGenerationValidationFinding[] {
  if (result.ok) {
    return result.results.flatMap((assertion) => {
      if (assertion.passed) {
        return [];
      }

      return [
        {
          code: 'preview_assertion_failed',
          severity: 'error' as const,
          message: assertion.message,
          file: '/preview/tests.json',
          field: null,
          fix: 'Update the generated app UI or preview assertion so the reviewed preview passes.',
          detail: {
            name: assertion.name,
            selector: assertion.selector,
            assertionCode: assertion.code,
            actualText: assertion.actualText ?? null,
          },
        },
      ];
    });
  }

  if (result.kind === 'validation_failed') {
    return result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: 'error',
      message: diagnostic.message,
      file: diagnostic.file ?? null,
      field: diagnostic.field ?? null,
      fix: diagnostic.fix,
      detail: {},
    }));
  }

  return [
    {
      code: 'preview_runtime_failed',
      severity: 'error',
      message: result.message,
      file: null,
      field: null,
      fix: 'Fix the generated browser code so it boots in Lantern preview without runtime errors.',
      detail: {
        details: result.details,
      },
    },
  ];
}

function normalizePreviewPath(path: string): string {
  const trimmed = path.trim();

  if (
    trimmed === '' ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.split('/').includes('..')
  ) {
    throw new Error(`Generated preview file path ${path} must stay inside the package root.`);
  }

  return trimmed.replaceAll(/\/+/g, '/');
}

function parentPath(relativePath: string): string {
  const parts = relativePath.split('/');

  parts.pop();

  return parts.join('/');
}
