import {
  expectRecord,
  expectStringArray,
  parseProgressUpdates,
  parseValidationFindings,
  parseWorkspaceFiles,
} from './binding_result.ts';
import { parseAppGenerationPlanningResult } from './model_output.ts';
import type { AppGenerationValidationFinding, AppWriterWorkspaceFile } from './types.ts';
import type {
  AppWriterWorkspaceHarness,
  AppWriterWorkspaceHarnessResult,
} from './workspace_runner.ts';

const HARNESS_PLAN_PATH = '/app-writer/workspace-harness/plan';
const HARNESS_AUTHOR_PATH = '/app-writer/workspace-harness/author';
const HARNESS_REPAIR_PATH = '/app-writer/workspace-harness/repair';

export interface AppWriterWorkspaceHarnessBinding {
  fetch(request: Request): Promise<Response>;
}

export function createBoundAppWriterWorkspaceHarness(
  binding: AppWriterWorkspaceHarnessBinding,
): AppWriterWorkspaceHarness {
  return {
    async plan(input) {
      return parseAppGenerationPlanningResult(
        await postJson({
          binding,
          path: HARNESS_PLAN_PATH,
          body: input,
          responseName: 'workspace harness planning response',
        }),
      );
    },
    async author(input) {
      return parseWorkspaceHarnessResult(
        await postJson({
          binding,
          path: HARNESS_AUTHOR_PATH,
          body: input,
          responseName: 'workspace harness authoring response',
        }),
        'workspaceHarnessAuthorResult',
      );
    },
    async repair(input) {
      return parseWorkspaceHarnessResult(
        await postJson({
          binding,
          path: HARNESS_REPAIR_PATH,
          body: input,
          responseName: 'workspace harness repair response',
        }),
        'workspaceHarnessRepairResult',
      );
    },
  };
}

export function isAppWriterWorkspaceHarnessBinding(
  value: unknown,
): value is AppWriterWorkspaceHarnessBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AppWriterWorkspaceHarnessBinding>).fetch === 'function'
  );
}

async function postJson(input: {
  binding: AppWriterWorkspaceHarnessBinding;
  path: string;
  body: unknown;
  responseName: string;
}): Promise<unknown> {
  const response = await input.binding.fetch(
    new Request(`https://app-writer-workspace-harness.internal${input.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.body),
    }),
  );
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`${input.responseName} failed with HTTP ${response.status}: ${responseBody}`);
  }

  try {
    return JSON.parse(responseBody);
  } catch {
    throw new TypeError(`${input.responseName} must be valid JSON.`);
  }
}

function parseWorkspaceHarnessResult(
  value: unknown,
  fieldName: string,
): AppWriterWorkspaceHarnessResult {
  const record = expectRecord(value, fieldName);

  return {
    files: parseWorkspaceFiles(record.files, `${fieldName}.files`) as AppWriterWorkspaceFile[],
    progressUpdates: parseProgressUpdates(record.progressUpdates, `${fieldName}.progressUpdates`),
    notes: expectStringArray(record.notes, `${fieldName}.notes`),
    validationFindings:
      record.validationFindings === undefined
        ? []
        : (parseValidationFindings(
            record.validationFindings,
            `${fieldName}.validationFindings`,
          ) as AppGenerationValidationFinding[]),
  };
}
