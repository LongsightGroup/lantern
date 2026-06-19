import {
  expectRecord,
  expectStringArray,
  parseModelRequestMetadata,
  parseProgressUpdates,
  parseValidationFindings,
  parseWorkspaceFiles,
} from './binding_result.ts';
import type {
  AppGenerationModelRequestMetadata,
  AppGenerationProgressStage,
  AppGenerationProgressUpdate,
  AppGenerationValidationFinding,
  AppWriterWorkspaceFile,
} from './types.ts';

export interface StructuredWorkspaceHarnessResult {
  files: AppWriterWorkspaceFile[];
  progressUpdates: AppGenerationProgressUpdate[];
  notes: string[];
  validationFindings: AppGenerationValidationFinding[];
}

export interface WorkspaceHarnessResponse extends StructuredWorkspaceHarnessResult {
  modelRequestMetadata: AppGenerationModelRequestMetadata[];
}

export function parseStructuredWorkspaceHarnessResult(
  value: unknown,
  fieldName: string,
): StructuredWorkspaceHarnessResult {
  const record = expectRecord(value, fieldName);
  const files = parseWorkspaceFiles(record.files, `${fieldName}.files`);
  assertUniqueWorkspaceFilePaths(files, `${fieldName}.files`);

  return {
    files,
    progressUpdates: parseProgressUpdates(record.progressUpdates, `${fieldName}.progressUpdates`),
    notes: expectStringArray(record.notes, `${fieldName}.notes`),
    validationFindings: record.validationFindings === undefined ? [] : parseValidationFindings(
      record.validationFindings,
      `${fieldName}.validationFindings`,
    ),
  };
}

export function parseWorkspaceHarnessResponse(
  value: unknown,
  fieldName: string,
): WorkspaceHarnessResponse {
  const record = expectRecord(value, fieldName);
  const parsed = parseStructuredWorkspaceHarnessResult(record, fieldName);
  const modelRequestMetadata: AppGenerationModelRequestMetadata[] =
    record.modelRequestMetadata === undefined ? [] : parseModelRequestMetadata(
      record.modelRequestMetadata,
      `${fieldName}.modelRequestMetadata`,
    );

  return {
    ...parsed,
    modelRequestMetadata,
  };
}

export function formatStructuredWorkspaceHarnessResultContract(input: {
  progressStage: AppGenerationProgressStage;
}): string {
  return JSON.stringify(
    {
      files: [
        {
          path: 'relative/path.ext',
          contents: 'complete UTF-8 file contents',
          role: 'package',
        },
      ],
      progressUpdates: [
        {
          stage: input.progressStage,
          message: 'short reviewer-facing progress message',
        },
      ],
      notes: ['short implementation or repair note'],
      validationFindings: [
        {
          code: 'clear_machine_code_when_blocked',
          severity: 'error',
          message: 'clear human-readable diagnostic',
          file: null,
          field: null,
          fix: null,
          detail: {},
        },
      ],
    },
    null,
    2,
  );
}

function assertUniqueWorkspaceFilePaths(
  files: readonly AppWriterWorkspaceFile[],
  fieldName: string,
): void {
  const firstIndexByPath = new Map<string, number>();

  files.forEach((file, index) => {
    const firstIndex = firstIndexByPath.get(file.path);

    if (firstIndex !== undefined) {
      throw new TypeError(
        `${fieldName}[${index}].path duplicates ${fieldName}[${firstIndex}].path.`,
      );
    }

    firstIndexByPath.set(file.path, index);
  });
}
