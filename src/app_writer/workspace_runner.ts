import { buildInitializedAppWriterWorkspace } from './workspace_initialization.ts';
import type { AppWriterContextSelection } from './context.ts';
import { buildLanternOwnedAppGenerationPlanningResult } from './planning.ts';
import type {
  AppGenerationModelRequestMetadata,
  AppGenerationPlanningResult,
  AppGenerationProgressUpdate,
  AppGenerationValidationFinding,
  AppGenerationWorkspaceRecord,
  AppPackageFileGenerationInput,
  AppPackageFileGenerationResult,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackageRepairInput,
  AppWriterWorkspaceFile,
} from './types.ts';

export interface AppWriterWorkspaceRunner {
  initialize(input: AppWriterWorkspaceInitializeInput): Promise<AppGenerationWorkspaceRecord>;
  plan(input: AppWriterWorkspacePlanningInput): Promise<AppGenerationPlanningResult>;
  author(input: AppWriterWorkspaceAuthorInput): Promise<AppPackageFileGenerationResult>;
  repair(input: AppWriterWorkspaceRepairInput): Promise<AppPackageGenerationResult>;
}

export interface AppWriterWorkspaceInitializeInput {
  generationId: string;
  contextSelection: AppWriterContextSelection;
  initializedAt: string;
  revisionSourceFiles?: readonly AppWriterWorkspaceFile[];
}

export interface AppWriterWorkspacePlanningInput extends AppPackageGenerationInput {
  initializedWorkspace: AppGenerationWorkspaceRecord;
}

export interface AppWriterWorkspaceAuthorInput extends AppPackageFileGenerationInput {
  initializedWorkspace: AppGenerationWorkspaceRecord;
}

export interface AppWriterWorkspaceRepairInput extends AppPackageRepairInput {
  currentWorkspace: AppGenerationWorkspaceRecord | null;
}

export interface AppWriterWorkspaceHarnessResult {
  files: AppGenerationWorkspaceRecord['files'];
  progressUpdates: AppGenerationProgressUpdate[];
  notes: string[];
  modelRequestMetadata?: AppGenerationModelRequestMetadata[];
  validationFindings?: AppGenerationValidationFinding[];
}

export interface AppWriterWorkspaceHarness {
  author(input: {
    generationInput: AppPackageGenerationInput;
    planning: AppGenerationPlanningResult;
    workspace: AppGenerationWorkspaceRecord;
  }): Promise<AppWriterWorkspaceHarnessResult>;
  repair(input: {
    generationInput: AppPackageGenerationInput;
    previousResult: AppPackageGenerationResult;
    validationFindings: AppGenerationValidationFinding[];
    repairAttempt: number;
    workspace: AppGenerationWorkspaceRecord;
  }): Promise<AppWriterWorkspaceHarnessResult>;
}

export class AppWriterWorkspaceHarnessError extends Error {
  readonly code: string;
  readonly modelRequestMetadata: AppGenerationModelRequestMetadata[];
  readonly notes: string[];

  constructor(input: {
    code: string;
    message: string;
    modelRequestMetadata?: readonly AppGenerationModelRequestMetadata[];
    notes?: readonly string[];
  }) {
    super(input.message);
    this.name = 'AppWriterWorkspaceHarnessError';
    this.code = input.code;
    this.modelRequestMetadata = [...(input.modelRequestMetadata ?? [])];
    this.notes = [...(input.notes ?? [])];
  }
}

export function createUnavailableAppWriterWorkspaceRunner(
  message = APP_WRITER_WORKSPACE_RUNNER_UNAVAILABLE_MESSAGE,
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

export const APP_WRITER_WORKSPACE_RUNNER_UNAVAILABLE_MESSAGE =
  'Lantern app writer workspace harness is not configured. Bind the platform-owned workspace harness before using AI app writing.';

export function createHarnessWorkspaceRunner(runnerInput: {
  harness: AppWriterWorkspaceHarness;
}): AppWriterWorkspaceRunner {
  return {
    initialize(workspaceInput) {
      return Promise.resolve(buildInitializedAppWriterWorkspace(workspaceInput));
    },
    plan(input) {
      return Promise.resolve(buildLanternOwnedAppGenerationPlanningResult(input));
    },
    async author(input) {
      const result = await runnerInput.harness.author({
        generationInput: input,
        planning: input.planning,
        workspace: input.initializedWorkspace,
      });

      return {
        files: result.files,
        progressUpdates: result.progressUpdates,
        notes: result.notes,
        ...(result.modelRequestMetadata === undefined
          ? {}
          : { modelRequestMetadata: result.modelRequestMetadata }),
        validationFindings: result.validationFindings ?? [],
      };
    },
    async repair(input) {
      const workspace = input.currentWorkspace;

      if (workspace === null) {
        throw new Error('Harness workspace repair requires a current workspace snapshot.');
      }

      const result = await runnerInput.harness.repair({
        generationInput: input,
        previousResult: input.previousResult,
        validationFindings: input.validationFindings,
        repairAttempt: input.repairAttempt,
        workspace,
      });

      return {
        ...input.previousResult,
        files: result.files,
        progressUpdates: result.progressUpdates,
        notes: [...input.previousResult.notes, ...result.notes],
        modelRequestMetadata: [
          ...(input.previousResult.modelRequestMetadata ?? []),
          ...(result.modelRequestMetadata ?? []),
        ],
        validationFindings: result.validationFindings ?? [],
      };
    },
  };
}
