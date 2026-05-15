import type { Capability } from '../../sdk/app-sdk.ts';
import type { GradingMode } from '../package_review/types.ts';

export const APP_GENERATION_STATUSES = [
  'started',
  'normalizing',
  'planning',
  'generating_package',
  'validating',
  'repairing',
  'previewing',
  'saved_pending_version',
  'failed',
] as const;

export type AppGenerationStatus = (typeof APP_GENERATION_STATUSES)[number];

export const APP_WRITER_STARTER_IDS = ['simple-activity', 'browser-autograder'] as const;

export type AppWriterStarterId = (typeof APP_WRITER_STARTER_IDS)[number];

export const APP_GENERATION_PROGRESS_STAGES = [
  'understanding_request',
  'planning_app',
  'building_package',
  'preparing_review',
  'repairing_package',
] as const;

export type AppGenerationProgressStage = (typeof APP_GENERATION_PROGRESS_STAGES)[number];

export type AppGenerationActivityType =
  | 'quiz'
  | 'sorting'
  | 'matching'
  | 'flashcards'
  | 'simulation'
  | 'game'
  | 'practice';

export type AppGenerationGradingMode = Extract<
  GradingMode,
  'completion' | 'declarative' | 'browser'
>;

export type AppGenerationAttemptEventType = 'answer' | 'progress' | 'complete';

export type AppGenerationValidationSeverity = 'error' | 'warning';

export interface AppGenerationNormalizedRequest {
  learningGoal: string;
  audience: string;
  contentSummary: string;
  requestedActivity: string;
  constraints: string[];
  missingInformation: string[];
  safeToGenerate: boolean;
}

export interface AppGenerationPlan {
  appId: string;
  title: string;
  description: string;
  learningGoal: string;
  audience: string;
  activityType: AppGenerationActivityType;
  learnerFlow: string[];
  contentModel: Record<string, unknown>;
  capabilities: Capability[];
  grading: {
    mode: AppGenerationGradingMode;
    maxScore: number;
    scoringSummary: string;
  };
  attemptEvents: AppGenerationAttemptEventPlan[];
  previewTests: string[];
  accessibilityNotes: string[];
  riskNotes: string[];
}

export interface AppGenerationAttemptEventPlan {
  when: string;
  eventType: AppGenerationAttemptEventType;
  questionIdPattern: string;
}

export interface AppGenerationProgressUpdate {
  stage: AppGenerationProgressStage;
  message: string;
}

export interface AppWriterWorkspaceFile {
  path: string;
  contents: string;
}

export interface AppGenerationValidationFinding {
  code: string;
  severity: AppGenerationValidationSeverity;
  message: string;
  file: string | null;
  field: string | null;
  fix: string | null;
  detail: Record<string, unknown>;
}

export interface AppGenerationRunRecord {
  generationId: string;
  ownerId: string;
  status: AppGenerationStatus;
  requestedAppId: string | null;
  generatedAppId: string | null;
  generatedVersion: string | null;
  packageVersionId: number | null;
  promptText: string;
  normalizedRequest: AppGenerationNormalizedRequest | null;
  appPlan: AppGenerationPlan | null;
  selectedStarterId: AppWriterStarterId | null;
  selectedContext: Record<string, unknown>;
  modelRequestMetadata: AppGenerationModelRequestMetadata[];
  generationNotes: string[];
  validationFindings: AppGenerationValidationFinding[];
  repairAttemptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppGenerationModelRequestMetadata {
  provider: string;
  model: string | null;
  requestId: string | null;
  durationMs: number | null;
  responseCharacters: number | null;
}

export interface AppPackageGenerationInput {
  generationId: string;
  ownerId: string;
  promptText: string;
  requestedAppId: string | null;
  selectedStarterId: AppWriterStarterId;
  selectedContext: Record<string, unknown>;
  createdAt: string;
}

export interface AppPackageRepairInput extends AppPackageGenerationInput {
  repairAttempt: number;
  previousResult: AppPackageGenerationResult;
  validationFindings: AppGenerationValidationFinding[];
}

export interface AppPackagePreviewInput {
  generationId: string;
  selectedStarterId: AppWriterStarterId;
  files: readonly AppWriterWorkspaceFile[];
}

export interface AppPackagePreviewer {
  preview(input: AppPackagePreviewInput): Promise<AppGenerationValidationFinding[]>;
}

export interface AppPackageSourceCompileInput {
  generationId: string;
  appPlan: AppGenerationPlan;
  selectedStarterId: AppWriterStarterId;
  files: readonly AppWriterWorkspaceFile[];
}

export interface AppPackageSourceCompileResult {
  files: AppWriterWorkspaceFile[];
  validationFindings: AppGenerationValidationFinding[];
  notes: string[];
}

export interface AppPackageSourceCompiler {
  compile(input: AppPackageSourceCompileInput): Promise<AppPackageSourceCompileResult>;
}

export interface AppPackageGenerationResult {
  normalizedRequest: AppGenerationNormalizedRequest;
  appPlan: AppGenerationPlan;
  selectedStarterId: AppWriterStarterId;
  files: AppWriterWorkspaceFile[];
  progressUpdates: AppGenerationProgressUpdate[];
  notes: string[];
  validationFindings: AppGenerationValidationFinding[];
  modelRequestMetadata?: AppGenerationModelRequestMetadata[];
}
