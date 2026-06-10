import type { AppWriterSelectedContext } from '../app_writer/context.ts';
import { selectCurrentGenerationPlanStepFromWorkspace } from '../app_writer/generation_plan.ts';
import type {
  AppGenerationRunRecord,
  AppGenerationStatus,
  AppGenerationWorkspaceRecord,
} from '../app_writer/types.ts';
import { readUnknownString } from '../package_review/manifest_view.ts';

export { selectCurrentGenerationPlanStepFromWorkspace as selectCurrentGenerationPlanStep };

export function isActiveGenerationStatus(status: AppGenerationStatus): boolean {
  return (
    status === 'started' ||
    status === 'initializing' ||
    status === 'normalizing' ||
    status === 'planning' ||
    status === 'generating_package' ||
    status === 'validating' ||
    status === 'repairing' ||
    status === 'previewing'
  );
}

export function progressIndexForStatus(status: AppGenerationStatus): number {
  if (status === 'failed') {
    return -1;
  }

  if (status === 'normalizing') {
    return 2;
  }

  if (status === 'repairing') {
    return 4;
  }

  const ordered: AppGenerationStatus[] = [
    'started',
    'initializing',
    'planning',
    'generating_package',
    'validating',
    'previewing',
    'saved_pending_version',
  ];

  return ordered.indexOf(status);
}

export function readPreviewStepResult(workspace: AppGenerationWorkspaceRecord | null): {
  assertionCount: number;
  passedAssertionCount: number;
  runtimeLogCount: number;
  summary: string;
} | null {
  const step = workspace?.generationPlan.find((candidate) => candidate.id === 'preview_runtime');

  if (step === undefined) {
    return null;
  }

  const assertionCount = readUnknownNumber(step.result.assertionCount);
  const passedAssertionCount = readUnknownNumber(step.result.passedAssertionCount);
  const runtimeLogCount = readUnknownNumber(step.result.runtimeLogCount);
  const summary = readUnknownString(step.result.summary);

  if (
    assertionCount === null ||
    passedAssertionCount === null ||
    runtimeLogCount === null ||
    summary === null
  ) {
    return null;
  }

  return {
    assertionCount,
    passedAssertionCount,
    runtimeLogCount,
    summary,
  };
}

export function readUnknownNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatResultValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (typeof value === 'object') {
    return 'object';
  }

  return 'unknown';
}

export function formatWorkspaceFileRole(role: string | undefined): string {
  return role ?? 'package';
}

export function statusClassForPlanStep(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'status-approved';
    case 'failed':
      return 'status-rejected';
    case 'running':
      return 'status-pending';
    default:
      return 'status-pending';
  }
}

export function statusClassForModelOutcome(outcome: string): string {
  switch (outcome) {
    case 'succeeded':
      return 'status-approved';
    case 'failed':
    case 'timed_out':
      return 'status-rejected';
    default:
      return 'status-pending';
  }
}

export function formatNullableNumber(value: number | null): string {
  return value === null ? 'unknown' : String(value);
}

export function readAuditString(record: Record<string, unknown>, key: string): string | null {
  return readUnknownString(record[key]);
}

export function formatProgressStage(stage: string): string {
  return stage.replaceAll('_', ' ');
}

export function formatSelectedContext(context: AppWriterSelectedContext): string {
  const references = context.referenceAppIds;
  const recipe = formatAppWriterRecipe(context);
  const revision = formatRevisionContext(context);
  const parts = [
    ...(recipe === null ? [] : [recipe]),
    ...(revision === null ? [] : [revision]),
    references.length === 0 ? 'No references recorded.' : `References: ${references.join(', ')}`,
  ];

  return parts.join(' · ');
}

export function formatStatus(status: AppGenerationRunRecord['status']): string {
  return status.replaceAll('_', ' ');
}

function formatRevisionContext(context: AppWriterSelectedContext): string | null {
  const revision = context.revision;

  if (revision === undefined) {
    return null;
  }

  const sourceAppId = revision.sourceAppId;
  const sourceVersion = revision.sourceVersion;
  const targetVersion = revision.targetVersion;

  return `Revision ${sourceAppId}@${sourceVersion} -> ${targetVersion}`;
}

function formatAppWriterRecipe(context: AppWriterSelectedContext): string | null {
  const recipeId = context.recipe.recipeId;
  const recipeVersion = context.recipe.recipeVersion;

  return `Recipe ${recipeId}@${recipeVersion}`;
}
