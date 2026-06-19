import type {
  AppGenerationModelRequestMetadata,
  AppGenerationModelRequestStage,
  AppGenerationPlanningResult,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
} from './types.ts';
import type { D1Database } from '../db/d1.ts';

export interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

export interface AppWriterAgentEnv extends Record<string, unknown> {
  DB?: D1Database;
  AI?: CloudflareAiBinding;
  APP_WRITER_MODEL?: string;
}

export interface CloudflareAiMessage {
  role: 'system' | 'user';
  content: string;
}

export interface CloudflareAiBinding {
  run(
    model: string,
    input: {
      messages: CloudflareAiMessage[];
      stream?: true;
    },
  ): Promise<unknown>;
}

export interface StoredAppWriterAgentSession {
  generationId: string;
  ownerId: string;
  workflowInstanceId: string | null;
  observedAt: string;
  currentModelStage?: AppGenerationModelRequestStage | null;
  currentModelAttempt?: number | null;
}

export interface WorkspaceAuthorInput {
  generationInput: AppPackageGenerationInput;
  workspace: AppGenerationWorkspaceRecord;
  planning: AppGenerationPlanningResult;
}

export interface WorkspaceRepairInput {
  generationInput: AppPackageGenerationInput;
  previousResult: AppPackageGenerationResult;
  validationFindings: AppGenerationWorkspaceRecord['validationFindings'];
  repairAttempt: number;
  workspace: AppGenerationWorkspaceRecord;
}

export interface AppWriterAgentHarnessError extends Error {
  readonly kind: 'harness';
  readonly code: string;
  readonly modelRequestMetadata: AppGenerationModelRequestMetadata[];
  readonly notes: string[];
}

export interface AppWriterAgentModelRequestError extends Error {
  readonly kind: 'model_request';
  readonly code: 'model_timeout' | 'provider_error';
  readonly metadata: AppGenerationModelRequestMetadata;
}
