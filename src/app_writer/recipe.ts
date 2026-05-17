import type { AppWriterAuthoringMode, AppWriterStarterId } from './types.ts';

export const APP_WRITER_RECIPE_ID = 'lantern-learning-app-writer';
export const APP_WRITER_RECIPE_VERSION = '0.1.0';
export const APP_WRITER_INSTRUCTIONS_VERSION = '2026-05-16.pico-style-contract';
export const APP_WRITER_DEFINITION_OF_DONE_VERSION = '2026-05-16';
export const APP_WRITER_PROMPT_CONTEXT_VERSION = 2;
export const APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS = 4;

export const APP_WRITER_PUBLIC_CONTRACT_SOURCES = [
  'APP_PACKAGE_SPEC.md',
  'AUTHORING_FOR_LLMS.md',
  'schemas/app-manifest.schema.json',
  'sdk/app-sdk.ts',
] as const;

export const APP_WRITER_RECIPE_STARTER_SET = [
  'simple-activity',
  'browser-autograder',
] as const satisfies readonly AppWriterStarterId[];

export const APP_WRITER_RECIPE_OUTPUT_CONTRACTS = [
  'lantern_owned_plan',
  'shell_workspace_snapshot',
  'codemode_workspace_edit',
] as const;

export const APP_WRITER_RECIPE_PROOF_CHECKS = [
  'strict_typescript',
  'package_validation',
  'preview_runtime_assertions',
  'policy_checks',
  'style_contract',
] as const;

export interface AppWriterRecipe {
  recipeId: typeof APP_WRITER_RECIPE_ID;
  recipeVersion: typeof APP_WRITER_RECIPE_VERSION;
  instructionsVersion: typeof APP_WRITER_INSTRUCTIONS_VERSION;
  definitionOfDoneVersion: typeof APP_WRITER_DEFINITION_OF_DONE_VERSION;
  promptContextVersion: typeof APP_WRITER_PROMPT_CONTEXT_VERSION;
  starterSet: AppWriterStarterId[];
  authoringMode: AppWriterAuthoringMode;
  outputContracts: Array<(typeof APP_WRITER_RECIPE_OUTPUT_CONTRACTS)[number]>;
  proofChecks: Array<(typeof APP_WRITER_RECIPE_PROOF_CHECKS)[number]>;
  contextSources: Array<(typeof APP_WRITER_PUBLIC_CONTRACT_SOURCES)[number]>;
  runtimeApi: 'window.GatewayApp';
  maxRepairAttempts: number;
}

export function buildAppWriterRecipe(input: {
  authoringMode: AppWriterAuthoringMode;
  maxRepairAttempts: number | undefined;
}): AppWriterRecipe {
  return {
    recipeId: APP_WRITER_RECIPE_ID,
    recipeVersion: APP_WRITER_RECIPE_VERSION,
    instructionsVersion: APP_WRITER_INSTRUCTIONS_VERSION,
    definitionOfDoneVersion: APP_WRITER_DEFINITION_OF_DONE_VERSION,
    promptContextVersion: APP_WRITER_PROMPT_CONTEXT_VERSION,
    starterSet: [...APP_WRITER_RECIPE_STARTER_SET],
    authoringMode: input.authoringMode,
    outputContracts: [...APP_WRITER_RECIPE_OUTPUT_CONTRACTS],
    proofChecks: [...APP_WRITER_RECIPE_PROOF_CHECKS],
    contextSources: [...APP_WRITER_PUBLIC_CONTRACT_SOURCES],
    runtimeApi: 'window.GatewayApp',
    maxRepairAttempts: input.maxRepairAttempts ?? APP_WRITER_DEFAULT_MAX_REPAIR_ATTEMPTS,
  };
}
