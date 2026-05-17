import type { LocalPreviewAssertionRunResult } from '../authoring/local_preview_assertions.ts';
import type { LocalPreviewLogEntry } from '../authoring/local_preview.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type { AppPackagePreviewer, AppPackagePreviewResult } from './types.ts';

export function createLocalAppPackagePreviewer(
  input: {
    settleTimeoutMs?: number;
  } = {},
): AppPackagePreviewer {
  return {
    async preview(previewInput) {
      const { runLocalPreviewAssertionsForSource } =
        await import('../authoring/local_preview_assertions.ts');
      const options =
        input.settleTimeoutMs === undefined ? {} : { settleTimeoutMs: input.settleTimeoutMs };
      const source = createMemoryPackageSource(
        previewInput.files.map((file) => ({
          relativePath: file.path,
          bytes: file.contents,
        })),
      );

      return mapPreviewAssertionResult(
        await runLocalPreviewAssertionsForSource(source, {
          packageRoot: `memory://app-writer/${previewInput.generationId}`,
          ...options,
        }),
      );
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

function mapPreviewAssertionResult(
  result: LocalPreviewAssertionRunResult,
): AppPackagePreviewResult {
  if (result.ok) {
    const validationFindings = result.results.flatMap((assertion) => {
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

    return {
      validationFindings,
      assertionCount: result.results.length,
      passedAssertionCount: result.passedCount,
      runtimeLog: result.runtimeLog.map(mapPreviewRuntimeLogEntry),
      summary:
        validationFindings.length === 0
          ? `Passed ${result.passedCount}/${result.results.length} preview assertions.`
          : `Failed ${result.failedCount}/${result.results.length} preview assertions.`,
    };
  }

  if (result.kind === 'validation_failed') {
    return {
      validationFindings: result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: 'error',
        message: diagnostic.message,
        file: diagnostic.file ?? null,
        field: diagnostic.field ?? null,
        fix: diagnostic.fix,
        detail: {},
      })),
      assertionCount: 0,
      passedAssertionCount: 0,
      runtimeLog: [],
      summary: `Preview package validation failed with ${result.diagnostics.length} diagnostics.`,
    };
  }

  return {
    validationFindings: [
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
    ],
    assertionCount: 0,
    passedAssertionCount: 0,
    runtimeLog: result.runtimeLog.map(mapPreviewRuntimeLogEntry),
    summary: 'Preview runtime failed before assertions completed.',
  };
}

function mapPreviewRuntimeLogEntry(
  entry: LocalPreviewLogEntry,
): AppPackagePreviewResult['runtimeLog'][number] {
  return {
    level: 'info',
    message: entry.eventType.replaceAll('.', ' '),
    detail: {
      ...entry.detail,
      occurredAt: entry.occurredAt,
    },
  };
}
