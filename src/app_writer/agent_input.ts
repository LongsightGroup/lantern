import type { AppWriterAgentObserveInput } from './agent_session.ts';
import type { WorkspaceAuthorInput, WorkspaceRepairInput } from './agent_types.ts';
import {
  expectNullableString,
  expectNumber,
  expectRecord,
  expectString,
  parseAppGenerationPlanningResult,
  parseAppGenerationWorkspaceRecord,
  parseAppPackageGenerationInput,
  parseAppPackageGenerationResult,
  parseValidationFindings,
} from './binding_result.ts';
import { readJson } from './http_json.ts';

export async function readObserveInput(request: Request): Promise<AppWriterAgentObserveInput> {
  const record = expectRecord(
    await readJson(request, 'App writer Agent request body must be valid JSON.'),
    'appWriterAgentObserveInput',
  );

  return {
    generationId: expectString(record.generationId, 'generationId'),
    ownerId: expectString(record.ownerId, 'ownerId'),
    workflowInstanceId: expectNullableString(record.workflowInstanceId, 'workflowInstanceId'),
    observedAt: expectString(record.observedAt, 'observedAt'),
  };
}

export async function readWorkspaceAuthorInput(request: Request): Promise<WorkspaceAuthorInput> {
  const value = expectRecord(
    await readJson(request, 'App writer Agent request body must be valid JSON.'),
    'workspaceAuthorInput',
  );

  return {
    generationInput: parseAppPackageGenerationInput(
      value.generationInput,
      'workspaceAuthorInput.generationInput',
    ),
    planning: parseAppGenerationPlanningResult(value.planning, 'workspaceAuthorInput.planning'),
    workspace: parseAppGenerationWorkspaceRecord(value.workspace, 'workspaceAuthorInput.workspace'),
  };
}

export async function readWorkspaceRepairInput(request: Request): Promise<WorkspaceRepairInput> {
  const value = expectRecord(
    await readJson(request, 'App writer Agent request body must be valid JSON.'),
    'workspaceRepairInput',
  );

  return {
    generationInput: parseAppPackageGenerationInput(
      value.generationInput,
      'workspaceRepairInput.generationInput',
    ),
    previousResult: parseAppPackageGenerationResult(
      value.previousResult,
      'workspaceRepairInput.previousResult',
    ),
    validationFindings: parseValidationFindings(
      value.validationFindings,
      'workspaceRepairInput.validationFindings',
    ),
    repairAttempt: expectNumber(value.repairAttempt, 'workspaceRepairInput.repairAttempt'),
    workspace: parseAppGenerationWorkspaceRecord(value.workspace, 'workspaceRepairInput.workspace'),
  };
}
