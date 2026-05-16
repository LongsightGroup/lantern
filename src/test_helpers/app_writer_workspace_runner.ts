import { buildInitializedAppWriterWorkspace } from '../app_writer/workspace_initialization.ts';
import type {
  AppGenerationPlanningResult,
  AppPackageFileGenerationResult,
  AppPackageGenerationResult,
} from '../app_writer/types.ts';
import type { AppWriterWorkspaceRunner } from '../app_writer/workspace_runner.ts';

interface StaticAppWriterWorkspaceRunnerOptions {
  repairResults?: readonly AppPackageGenerationResult[];
  authorDelay?: () => Promise<void>;
}

export function createStaticAppWriterWorkspaceRunner(
  result: AppPackageGenerationResult,
  optionsOrRepairResults:
    | readonly AppPackageGenerationResult[]
    | StaticAppWriterWorkspaceRunnerOptions = {},
): AppWriterWorkspaceRunner {
  let options: StaticAppWriterWorkspaceRunnerOptions;

  if (isGenerationResultArray(optionsOrRepairResults)) {
    options = { repairResults: optionsOrRepairResults };
  } else {
    options = optionsOrRepairResults;
  }
  const repairResults = (options.repairResults ?? []).map((repairResult) =>
    structuredClone(repairResult),
  );

  return {
    initialize(input) {
      return Promise.resolve(buildInitializedAppWriterWorkspace(input));
    },
    plan(_input) {
      return Promise.resolve(toPlanningResult(result));
    },
    async author(_input) {
      if (options.authorDelay !== undefined) {
        await options.authorDelay();
      }

      return toFileGenerationResult(result);
    },
    repair(_input) {
      const repairResult = repairResults.shift();

      if (repairResult === undefined) {
        return Promise.reject(new Error('Fake app writer workspace runner has no repair result.'));
      }

      return Promise.resolve(structuredClone(repairResult));
    },
  };
}

function isGenerationResultArray(
  value: readonly AppPackageGenerationResult[] | StaticAppWriterWorkspaceRunnerOptions,
): value is readonly AppPackageGenerationResult[] {
  return Array.isArray(value);
}

export function createUnavailableAppWriterWorkspaceRunner(
  message: string,
): AppWriterWorkspaceRunner {
  return {
    initialize(_input) {
      return Promise.reject(new Error(message));
    },
    plan(_input) {
      return Promise.reject(new Error(message));
    },
    author(_input) {
      return Promise.reject(new Error(message));
    },
    repair(_input) {
      return Promise.reject(new Error(message));
    },
  };
}

function toPlanningResult(result: AppPackageGenerationResult): AppGenerationPlanningResult {
  return {
    normalizedRequest: structuredClone(result.normalizedRequest),
    appPlan: structuredClone(result.appPlan),
    selectedStarterId: result.selectedStarterId,
    progressUpdates: structuredClone(result.progressUpdates),
    notes: structuredClone(result.notes),
    ...(result.modelRequestMetadata === undefined
      ? {}
      : { modelRequestMetadata: structuredClone(result.modelRequestMetadata) }),
  };
}

function toFileGenerationResult(
  result: AppPackageGenerationResult,
): AppPackageFileGenerationResult {
  return {
    files: structuredClone(result.files),
    progressUpdates: [],
    notes: [],
    validationFindings: structuredClone(result.validationFindings),
    ...(result.modelRequestMetadata === undefined
      ? {}
      : { modelRequestMetadata: structuredClone(result.modelRequestMetadata) }),
  };
}
