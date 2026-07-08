import type { AppWriterContextSelection } from './context.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationRunRecord,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
  AppPackageGenerationResult,
  AppPackagePreviewer,
  AppPackageSourceCompiler,
  AppWriterAuthoringMode,
} from './types.ts';
import type { AppWriterWorkspaceRunner } from './workspace_runner.ts';
import type { ImportedPackageVersion } from '../package_review/intake.ts';
import type { PackageSource } from '../package_review/package_source.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { PackageSnapshotStore } from '../package_review/snapshot_store.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';

export interface RunAppPackageGenerationInput {
  repository: Pick<
    PackageReviewRepository,
    | 'createAppGenerationRun'
    | 'updateAppGenerationRun'
    | 'registerPackageVersion'
    | 'recordAuditEvent'
    | 'saveAppGenerationWorkspace'
    | 'getAppGenerationWorkspaceByGenerationId'
    | 'getAppGenerationRunById'
  >;
  workspaceRunner: AppWriterWorkspaceRunner;
  packageSnapshotStore?: PackageSnapshotStore;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: {
    importPackageFromSource: (
      source: PackageSource,
      options?: { storageRoot?: string },
    ) => Promise<ImportedPackageVersion>;
    storageRoot?: string;
  };
  generationId: string;
  ownerId: string;
  promptText: string;
  requestedAppId?: string | null;
  authoringMode?: AppWriterAuthoringMode;
  maxRepairAttempts?: number;
  now?: () => string;
}

export interface RunAppPackageGenerationResult {
  run: AppGenerationRunRecord;
  generation: AppPackageGenerationResult;
  packageVersion: PackageVersionRecord | null;
}

export interface PlannedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  planning: AppGenerationPlanningResult;
}

export interface InitializedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
}

export interface GeneratedAppPackageFilesRun {
  run: AppGenerationRunRecord;
  generatorInput: AppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  initializedWorkspace: AppGenerationWorkspaceRecord;
  generation: AppPackageGenerationResult;
}

export interface StartedAppPackageGenerationRun {
  run: AppGenerationRunRecord;
  continueGeneration: () => Promise<RunAppPackageGenerationResult>;
}

export interface ContinueAppPackageGenerationRunInput {
  repository:
    & RunAppPackageGenerationInput['repository']
    & Pick<PackageReviewRepository, 'getAppGenerationRunById'>
    & Partial<Pick<PackageReviewRepository, 'getPackageVersionById'>>;
  workspaceRunner: AppWriterWorkspaceRunner;
  packageSnapshotStore?: PackageSnapshotStore;
  previewer?: AppPackagePreviewer;
  sourceCompiler?: AppPackageSourceCompiler;
  savePackage?: RunAppPackageGenerationInput['savePackage'];
  generationId: string;
  maxRepairAttempts?: number;
  now?: () => string;
}
