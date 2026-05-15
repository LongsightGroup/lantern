import type { AppWriterContextSelection } from './context.ts';
import { createInitializedGenerationPlan } from './generation_plan.ts';
import { buildAppWriterStarterWorkspace } from './starter_workspace.ts';
import type { AppGenerationWorkspaceRecord, AppWriterWorkspaceFile } from './types.ts';

export function buildInitializedAppWriterWorkspace(input: {
  generationId: string;
  contextSelection: AppWriterContextSelection;
  initializedAt: string;
}): AppGenerationWorkspaceRecord {
  const starter = buildAppWriterStarterWorkspace(
    input.contextSelection.starterId,
    input.contextSelection.selectedContext.authoringMode,
  );
  const packageFiles = starter.files.map(
    (file): AppWriterWorkspaceFile => ({
      ...file,
      role: 'package',
    }),
  );
  const instructionFiles = buildInstructionFiles({
    instructions: starter.instructions,
    contextSelection: input.contextSelection,
  });
  const files = [...instructionFiles, ...packageFiles];

  return {
    generationId: input.generationId,
    selectedStarterId: input.contextSelection.starterId,
    files,
    generationPlan: createInitializedGenerationPlan({
      startedAt: input.initializedAt,
      completedAt: input.initializedAt,
      result: {
        recipeId: input.contextSelection.selectedContext.recipe.recipeId,
        recipeVersion: input.contextSelection.selectedContext.recipe.recipeVersion,
        authoringMode: input.contextSelection.selectedContext.authoringMode,
        starterId: input.contextSelection.starterId,
        fileCount: files.length,
      },
    }),
    validationFindings: [],
    repairAttemptCount: 0,
    updatedAt: input.initializedAt,
  };
}

function buildInstructionFiles(input: {
  instructions: string;
  contextSelection: AppWriterContextSelection;
}): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'AGENTS.md',
      role: 'instruction',
      contents: input.instructions,
    },
    {
      path: '.lantern/contracts/app-writer-recipe.json',
      role: 'contract',
      contents: `${JSON.stringify(input.contextSelection.selectedContext.recipe, null, 2)}\n`,
    },
    {
      path: '.lantern/contracts/prompt-context.json',
      role: 'contract',
      contents: `${JSON.stringify(
        {
          referenceAppIds: input.contextSelection.selectedContext.referenceAppIds,
          publicContractSources: input.contextSelection.selectedContext.publicContractSources,
          promptContextVersion: input.contextSelection.selectedContext.promptContextVersion,
          promptContextExcerpts: input.contextSelection.selectedContext.promptContextExcerpts,
          selectionReason: input.contextSelection.selectedContext.selectionReason,
        },
        null,
        2,
      )}\n`,
    },
  ];
}
