import type {
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationResult,
} from './types.ts';
import {
  classifyProviderErrorCode,
  isGenerationProviderCapacityErrorMessage,
  isGenerationProviderInternalErrorMessage,
  isGenerationTimeoutMessage,
  isWorkspaceHarnessContractMessage,
} from './generation_error_classification.ts';
import { deduplicateStrings } from './string_utils.ts';
import { AppWriterWorkspaceHarnessError } from './workspace_runner.ts';

export class AppPackageGenerationFailedError extends Error {
  readonly run: AppGenerationRunRecord;

  constructor(message: string, run: AppGenerationRunRecord) {
    super(message);
    this.name = 'AppPackageGenerationFailedError';
    this.run = run;
  }
}

export function appendModelRequestMetadata(
  run: AppGenerationRunRecord,
  generation: AppPackageGenerationResult,
): AppGenerationRunRecord['modelRequestMetadata'] {
  return deduplicateModelRequestMetadata([
    ...run.modelRequestMetadata,
    ...(generation.modelRequestMetadata ?? []),
  ]);
}

export function appendModelRequestMetadataFromError(
  run: AppGenerationRunRecord,
  error: unknown,
): AppGenerationRunRecord['modelRequestMetadata'] {
  if (!(error instanceof AppWriterWorkspaceHarnessError)) {
    return run.modelRequestMetadata;
  }

  return deduplicateModelRequestMetadata([
    ...run.modelRequestMetadata,
    ...error.modelRequestMetadata,
  ]);
}

export function appendGenerationNotesFromError(
  run: AppGenerationRunRecord,
  error: unknown,
): AppGenerationRunRecord['generationNotes'] {
  if (!(error instanceof AppWriterWorkspaceHarnessError)) {
    return run.generationNotes;
  }

  return deduplicateStrings([...run.generationNotes, ...error.notes]);
}

function deduplicateModelRequestMetadata(
  metadata: readonly AppGenerationRunRecord['modelRequestMetadata'][number][],
): AppGenerationRunRecord['modelRequestMetadata'] {
  const seen = new Set<string>();
  const deduplicated: AppGenerationRunRecord['modelRequestMetadata'] = [];

  for (const item of metadata) {
    const key = JSON.stringify([
      item.provider,
      item.model,
      item.requestId,
      item.durationMs,
      item.responseCharacters,
      item.stage,
      item.attempt,
      item.outcome,
      item.errorCode,
    ]);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(item);
  }

  return deduplicated;
}

export function buildStarterMismatchFinding(input: {
  expectedStarterId: string;
  actualStarterId: string;
}): AppGenerationValidationFinding | null {
  if (input.expectedStarterId === input.actualStarterId) {
    return null;
  }

  return {
    code: 'starter_mismatch',
    severity: 'error',
    message:
      `Generated package selected starter ${input.actualStarterId}, but Lantern selected ${input.expectedStarterId}.`,
    file: null,
    field: '/selected_starter_id',
    fix: 'Regenerate package files against the Lantern-selected starter.',
    detail: {
      expectedStarterId: input.expectedStarterId,
      actualStarterId: input.actualStarterId,
    },
  };
}

const HARNESS_FAILURE_FINDING_CODES: Record<string, string> = {
  model_timeout: 'generation_model_timeout',
  provider_error: 'generation_model_provider_error',
  code_normalization_failed: 'generation_code_normalization_failed',
  code_execution_failed: 'generation_code_execution_failed',
  workspace_read_write_failed: 'generation_workspace_read_write_failed',
};

const HARNESS_FAILURE_FIXES: Record<string, string> = {
  code_normalization_failed:
    'Retry generation. Lantern could not normalize the Code Mode response into executable workspace-edit code after bounded attempts.',
  code_execution_failed:
    'Retry generation. Lantern executed the workspace-edit code but it failed after bounded attempts.',
  workspace_read_write_failed:
    'Check the app writer workspace service bindings and retry generation.',
  provider_error:
    'Retry generation. The model provider failed during the current app writer stage.',
  model_timeout:
    'Retry generation. Lantern runs generation in durable staged background work; repeated timeouts point to model/provider latency for the current stage.',
};

const PROVIDER_ERROR_FIXES: Record<string, string> = {
  timeout:
    'Retry generation. Lantern runs generation in durable staged background work; repeated timeouts point to model/provider latency for the current stage.',
  workspace_harness_contract:
    'Retry generation. Lantern rejects workspace harness responses unless they match the current stage contract.',
  internal_server_error:
    'Retry generation. The model provider returned an internal error after Lantern used its bounded retry attempts.',
  capacity_exceeded:
    'Retry generation. The model provider reported temporary capacity exhaustion after Lantern used its bounded retry attempts.',
};

export function buildGenerationFailedFinding(error: unknown): AppGenerationValidationFinding {
  const message = error instanceof Error ? error.message : 'App package generation failed.';
  const harnessCode = error instanceof AppWriterWorkspaceHarnessError ? error.code : null;
  const findingCode = resolveGenerationFailureFindingCode(message, harnessCode);
  const fix = resolveGenerationFailureFix(message, harnessCode);

  return {
    code: findingCode,
    severity: 'error',
    message,
    file: null,
    field: null,
    fix,
    detail: buildGenerationFailureDetail(error, message, harnessCode),
  };
}

function resolveGenerationFailureFindingCode(message: string, harnessCode: string | null): string {
  if (harnessCode !== null) {
    const mapped = HARNESS_FAILURE_FINDING_CODES[harnessCode];

    if (mapped !== undefined) {
      return mapped;
    }
  }

  if (isGenerationTimeoutMessage(message)) {
    return 'generation_model_timeout';
  }

  if (isGenerationProviderCapacityErrorMessage(message)) {
    return 'generation_model_capacity_exceeded';
  }

  if (isGenerationProviderInternalErrorMessage(message)) {
    return 'generation_model_provider_internal_error';
  }

  return 'generation_failed';
}

function resolveGenerationFailureFix(message: string, harnessCode: string | null): string {
  if (harnessCode !== null) {
    const harnessFix = HARNESS_FAILURE_FIXES[harnessCode];

    if (harnessFix !== undefined) {
      return harnessFix;
    }
  }

  const providerError = classifyProviderErrorCode(message);

  if (providerError !== null) {
    const providerFix = PROVIDER_ERROR_FIXES[providerError];

    if (providerFix !== undefined) {
      return providerFix;
    }
  }

  if (isWorkspaceHarnessContractMessage(message)) {
    return PROVIDER_ERROR_FIXES.workspace_harness_contract ??
      'Retry generation. Lantern rejects workspace harness responses unless they match the current stage contract.';
  }

  return 'Check the model configuration or retry generation.';
}

function buildGenerationFailureDetail(
  error: unknown,
  message: string,
  harnessCode: string | null,
): Record<string, unknown> {
  if (harnessCode !== null) {
    return {
      harnessError: harnessCode,
      modelRequestCount: error instanceof AppWriterWorkspaceHarnessError
        ? error.modelRequestMetadata.length
        : 0,
    };
  }

  const providerError = classifyProviderErrorCode(message);

  return providerError === null ? {} : { providerError };
}

export function buildPreviewNotConfiguredFinding(): AppGenerationValidationFinding {
  return {
    code: 'preview_not_configured',
    severity: 'error',
    message: 'Generated packages must pass Lantern preview before they can be saved.',
    file: null,
    field: null,
    fix: 'Configure an app package previewer for this generation environment.',
    detail: {},
  };
}

export function buildTypeScriptCompilerMissingFinding(): AppGenerationValidationFinding {
  return {
    code: 'typescript_compiler_unavailable',
    severity: 'error',
    message: 'Generated package returned TypeScript source, but no source compiler is configured.',
    file: null,
    field: null,
    fix:
      'Configure the Lantern TypeScript source compiler or regenerate browser-ready package files.',
    detail: {},
  };
}
