import type { AppWriterContextSelection } from './context.ts';
import type { AppGenerationRunRecord } from './types.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';

export function buildInitialGenerationRun(input: {
  generationId: string;
  ownerId: string;
  promptText: string;
  requestedAppId: string | null;
  contextSelection: AppWriterContextSelection;
  createdAt: string;
}): AppGenerationRunRecord {
  return {
    generationId: input.generationId,
    ownerId: input.ownerId,
    status: 'started',
    requestedAppId: input.requestedAppId,
    generatedAppId: null,
    generatedVersion: null,
    packageVersionId: null,
    promptText: input.promptText,
    normalizedRequest: null,
    appPlan: null,
    selectedStarterId: input.contextSelection.starterId,
    selectedContext: input.contextSelection.selectedContext,
    modelRequestMetadata: [],
    generationNotes: [],
    validationFindings: [],
    repairAttemptCount: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function formatRevisionPromptText(input: {
  promptText: string;
  sourcePackageVersion: PackageVersionRecord;
  targetVersion: string;
}): string {
  return [
    `Revision request for ${input.sourcePackageVersion.appId}@${input.sourcePackageVersion.version}.`,
    `Target version: ${input.targetVersion}.`,
    `Preserve manifest app_id: ${input.sourcePackageVersion.appId}.`,
    'Start from the existing package snapshot and make only the requested refinement.',
    '',
    'Instructor refinement prompt:',
    input.promptText,
  ].join('\n');
}
