import type { AppPackageGenerator } from './package_generator.ts';
import { buildInitializedAppWriterWorkspace } from './workspace_initialization.ts';
import { mergeWorkspaceFiles, selectNonPackageWorkspaceFiles } from './workspace_files.ts';
import type { AppWriterContextSelection } from './context.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationProgressUpdate,
  AppGenerationValidationFinding,
  AppGenerationWorkspaceRecord,
  AppPackageFileGenerationInput,
  AppPackageFileGenerationResult,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackageRepairInput,
} from './types.ts';

export interface AppWriterWorkspaceRunner {
  initialize(input: AppWriterWorkspaceInitializeInput): Promise<AppGenerationWorkspaceRecord>;
  plan(input: AppPackageGenerationInput): Promise<AppGenerationPlanningResult>;
  author(input: AppWriterWorkspaceAuthorInput): Promise<AppPackageFileGenerationResult>;
  repair(input: AppWriterWorkspaceRepairInput): Promise<AppPackageGenerationResult>;
}

export interface AppWriterWorkspaceInitializeInput {
  generationId: string;
  contextSelection: AppWriterContextSelection;
  initializedAt: string;
}

export interface AppWriterWorkspaceAuthorInput extends AppPackageFileGenerationInput {
  initializedWorkspace: AppGenerationWorkspaceRecord;
}

export interface AppWriterWorkspaceRepairInput extends AppPackageRepairInput {
  currentWorkspace: AppGenerationWorkspaceRecord | null;
}

export interface AppWriterWorkspaceHarness {
  run(input: {
    generationId: string;
    promptText: string;
    workspace: AppGenerationWorkspaceRecord;
    validationFindings: AppGenerationValidationFinding[];
    repairAttempt: number;
  }): Promise<{
    files: AppGenerationWorkspaceRecord['files'];
    progressUpdates: AppGenerationProgressUpdate[];
    notes: string[];
  }>;
}

export function createAppPackageGeneratorWorkspaceRunner(
  generator: AppPackageGenerator,
): AppWriterWorkspaceRunner {
  return {
    initialize(input) {
      return Promise.resolve(buildInitializedAppWriterWorkspace(input));
    },
    async plan(input) {
      if (typeof generator.plan !== 'function') {
        const generation = await generator.generate(input);

        return {
          normalizedRequest: generation.normalizedRequest,
          appPlan: generation.appPlan,
          selectedStarterId: generation.selectedStarterId,
          progressUpdates: generation.progressUpdates,
          notes: generation.notes,
          ...(generation.modelRequestMetadata === undefined
            ? {}
            : { modelRequestMetadata: generation.modelRequestMetadata }),
        };
      }

      return await generator.plan(input);
    },
    async author(input) {
      if (typeof generator.generateFiles !== 'function') {
        const generation = await generator.generate(input);

        return {
          files: mergeWorkspaceFiles(input.initializedWorkspace.files, generation.files),
          progressUpdates: generation.progressUpdates,
          notes: generation.notes,
          validationFindings: generation.validationFindings,
          ...(generation.modelRequestMetadata === undefined
            ? {}
            : { modelRequestMetadata: generation.modelRequestMetadata }),
        };
      }

      const generated = await generator.generateFiles(input);

      return {
        ...generated,
        files: mergeWorkspaceFiles(input.initializedWorkspace.files, generated.files),
      };
    },
    async repair(input) {
      if (typeof generator.repair !== 'function') {
        throw new TypeError('App writer workspace runner does not support repair.');
      }

      const repaired = await generator.repair(input);

      return {
        ...repaired,
        files:
          input.currentWorkspace === null
            ? repaired.files
            : mergeWorkspaceFiles(
                selectNonPackageWorkspaceFiles(input.currentWorkspace.files),
                repaired.files,
              ),
      };
    },
  };
}

export function createHarnessWorkspaceRunner(runnerInput: {
  harness: AppWriterWorkspaceHarness;
}): AppWriterWorkspaceRunner {
  return {
    initialize(workspaceInput) {
      return Promise.resolve(buildInitializedAppWriterWorkspace(workspaceInput));
    },
    plan(_input) {
      throw new Error('Harness workspace runner requires a planning implementation.');
    },
    async author(input) {
      const result = await runnerInput.harness.run({
        generationId: input.generationId,
        promptText: input.promptText,
        workspace: input.initializedWorkspace,
        validationFindings: [],
        repairAttempt: 0,
      });

      return {
        files: result.files,
        progressUpdates: result.progressUpdates,
        notes: result.notes,
        validationFindings: [],
      };
    },
    async repair(input) {
      const workspace = input.currentWorkspace;

      if (workspace === null) {
        throw new Error('Harness workspace repair requires a current workspace snapshot.');
      }

      const result = await runnerInput.harness.run({
        generationId: input.generationId,
        promptText: input.promptText,
        workspace,
        validationFindings: input.validationFindings,
        repairAttempt: input.repairAttempt,
      });

      return {
        ...input.previousResult,
        files: result.files,
        progressUpdates: result.progressUpdates,
        notes: [...input.previousResult.notes, ...result.notes],
        validationFindings: [],
      };
    },
  };
}
