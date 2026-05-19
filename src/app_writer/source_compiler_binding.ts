import type {
  AppPackageSourceCompileInput,
  AppPackageSourceCompiler,
  AppPackageSourceCompileResult,
} from './types.ts';
import {
  expectRecord,
  expectStringArray,
  parseValidationFindings,
  parseWorkspaceFiles,
} from './binding_result.ts';

export interface AppPackageSourceCompilerBinding {
  fetch(request: Request): Promise<Response>;
}

export function createBoundAppPackageSourceCompiler(
  binding: AppPackageSourceCompilerBinding,
): AppPackageSourceCompiler {
  return {
    supportsTypeScriptAuthoring: true,
    async compile(input) {
      const response = await binding.fetch(
        new Request('https://lantern.internal/app-writer/source-compiler/compile', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(input),
        }),
      );

      if (!response.ok) {
        throw new Error(
          `Lantern source compiler service returned ${response.status} ${response.statusText}.`,
        );
      }

      return parseSourceCompileResult(await response.json());
    },
  };
}

export function isAppPackageSourceCompilerBinding(
  value: unknown,
): value is AppPackageSourceCompilerBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AppPackageSourceCompilerBinding>).fetch === 'function'
  );
}

function parseSourceCompileResult(value: unknown): AppPackageSourceCompileResult {
  const record = expectRecord(value, 'sourceCompileResult');

  return {
    files: parseWorkspaceFiles(record.files, 'sourceCompileResult.files'),
    validationFindings: parseValidationFindings(
      record.validationFindings,
      'sourceCompileResult.validationFindings',
    ),
    notes: expectStringArray(record.notes, 'sourceCompileResult.notes'),
  };
}

export type SourceCompilerBindingRequest = AppPackageSourceCompileInput;
