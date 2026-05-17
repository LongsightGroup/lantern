import type {
  AppGenerationValidationFinding,
  AppPackagePreviewer,
  AppPackagePreviewInput,
  AppPackagePreviewResult,
} from './types.ts';
import {
  expectNullableNumber,
  expectRecord,
  expectString,
  parseValidationFindings,
} from './binding_result.ts';

export interface AppPackagePreviewerBinding {
  fetch(request: Request): Promise<Response>;
}

export function createBoundAppPackagePreviewer(
  binding: AppPackagePreviewerBinding,
): AppPackagePreviewer {
  return {
    async preview(input) {
      const response = await binding.fetch(
        new Request('https://lantern.internal/app-writer/preview/run', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(input),
        }),
      );

      if (!response.ok) {
        throw new Error(
          `Lantern app previewer service returned ${response.status} ${response.statusText}.`,
        );
      }

      return parsePreviewResult(await response.json());
    },
  };
}

export function isAppPackagePreviewerBinding(value: unknown): value is AppPackagePreviewerBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AppPackagePreviewerBinding>).fetch === 'function'
  );
}

function parsePreviewResult(value: unknown): AppPackagePreviewResult {
  const record = expectRecord(value, 'previewResult');

  return {
    validationFindings: parseValidationFindings(
      record.validationFindings,
      'previewResult.validationFindings',
    ) as AppGenerationValidationFinding[],
    assertionCount: expectNonNullableNumber(record.assertionCount, 'previewResult.assertionCount'),
    passedAssertionCount: expectNonNullableNumber(
      record.passedAssertionCount,
      'previewResult.passedAssertionCount',
    ),
    runtimeLog: parseRuntimeLog(record.runtimeLog, 'previewResult.runtimeLog'),
    summary: expectString(record.summary, 'previewResult.summary'),
  };
}

export type PreviewerBindingRequest = AppPackagePreviewInput;

function parseRuntimeLog(value: unknown, fieldName: string): AppPackagePreviewResult['runtimeLog'] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  return value.map((item, index) => {
    const record = expectRecord(item, `${fieldName}[${index}]`);

    return {
      level: expectRuntimeLogLevel(record.level, `${fieldName}[${index}].level`),
      message: expectString(record.message, `${fieldName}[${index}].message`),
      detail: expectRecord(record.detail, `${fieldName}[${index}].detail`),
    };
  });
}

function expectRuntimeLogLevel(
  value: unknown,
  fieldName: string,
): AppPackagePreviewResult['runtimeLog'][number]['level'] {
  if (value === 'info' || value === 'warning' || value === 'error') {
    return value;
  }

  throw new TypeError(`${fieldName} must be info, warning, or error.`);
}

function expectNonNullableNumber(value: unknown, fieldName: string): number {
  const parsed = expectNullableNumber(value, fieldName);

  if (parsed === null) {
    throw new TypeError(`${fieldName} must be a number.`);
  }

  return parsed;
}
