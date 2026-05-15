import type {
  AppGenerationValidationFinding,
  AppPackagePreviewInput,
  AppPackagePreviewer,
} from './types.ts';
import { expectRecord, parseValidationFindings } from './binding_result.ts';

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

function parsePreviewResult(value: unknown): AppGenerationValidationFinding[] {
  const record = expectRecord(value, 'previewResult');

  return parseValidationFindings(record.validationFindings, 'previewResult.validationFindings');
}

export type PreviewerBindingRequest = AppPackagePreviewInput;
