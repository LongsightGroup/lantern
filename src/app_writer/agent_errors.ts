import type { AppWriterAgentHarnessError, AppWriterAgentModelRequestError } from './agent_types.ts';
import type { AppGenerationModelRequestMetadata } from './types.ts';

export function createAppWriterAgentHarnessError(input: {
  code: string;
  message: string;
  modelRequestMetadata: readonly AppGenerationModelRequestMetadata[];
  notes: readonly string[];
}): AppWriterAgentHarnessError {
  return Object.assign(new Error(input.message), {
    name: 'AppWriterAgentHarnessError',
    kind: 'harness' as const,
    code: input.code,
    modelRequestMetadata: [...input.modelRequestMetadata],
    notes: [...input.notes],
  });
}

export function createAppWriterAgentModelRequestError(input: {
  code: 'model_timeout' | 'provider_error';
  message: string;
  metadata: AppGenerationModelRequestMetadata;
}): AppWriterAgentModelRequestError {
  return Object.assign(new Error(input.message), {
    name: 'AppWriterAgentModelRequestError',
    kind: 'model_request' as const,
    code: input.code,
    metadata: input.metadata,
  });
}

export function isAppWriterAgentHarnessError(error: unknown): error is AppWriterAgentHarnessError {
  return (
    error instanceof Error && (error as Partial<AppWriterAgentHarnessError>).kind === 'harness'
  );
}

export function isAppWriterAgentModelRequestError(
  error: unknown,
): error is AppWriterAgentModelRequestError {
  return (
    error instanceof Error &&
    (error as Partial<AppWriterAgentModelRequestError>).kind === 'model_request'
  );
}
