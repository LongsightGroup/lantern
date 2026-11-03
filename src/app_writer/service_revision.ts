import { type AppWriterContextSelection, readAppWriterRevisionContext } from './context.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationInput,
  AppPackageSourceCompiler,
  AppWriterAuthoringMode,
  AppWriterWorkspaceFile,
} from './types.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';
export { buildRevisionSourceFilesIfNeeded } from './service_revision_source.ts';

export function buildContextSelectionFromRun(
  run: AppGenerationRunRecord,
): AppWriterContextSelection {
  if (run.selectedStarterId === null) {
    throw new Error(`App generation run ${run.generationId} has no selected starter.`);
  }

  return {
    starterId: run.selectedStarterId,
    selectedContext: {
      ...run.selectedContext,
      authoringMode: run.selectedContext.authoringMode,
    },
  };
}

export function targetVersionForContext(contextSelection: AppWriterContextSelection): string {
  return readAppWriterRevisionContext(contextSelection.selectedContext)?.targetVersion ?? '0.1.0';
}

export function buildGeneratorInputFromRun(
  run: Pick<
    AppGenerationRunRecord,
    | 'generationId'
    | 'ownerId'
    | 'promptText'
    | 'requestedAppId'
    | 'selectedStarterId'
    | 'selectedContext'
    | 'createdAt'
  >,
  contextSelection: AppWriterContextSelection,
): AppPackageGenerationInput {
  return {
    generationId: run.generationId,
    ownerId: run.ownerId,
    promptText: run.promptText,
    requestedAppId: run.requestedAppId,
    selectedStarterId: contextSelection.starterId,
    selectedContext: contextSelection.selectedContext,
    authoringMode: contextSelection.selectedContext.authoringMode,
    createdAt: run.createdAt,
  };
}

export function validateRevisionPackageIdentity(input: {
  contextSelection: AppWriterContextSelection;
  files: readonly AppWriterWorkspaceFile[];
}): AppGenerationValidationFinding[] {
  const revision = readAppWriterRevisionContext(input.contextSelection.selectedContext);

  if (revision === null) {
    return [];
  }

  const manifestFile = selectPackageWorkspaceFiles(input.files).find(
    (file) => file.path === 'manifest.json',
  );

  if (manifestFile === undefined) {
    return [];
  }

  let manifest: Record<string, unknown>;

  try {
    const parsed = JSON.parse(manifestFile.contents) as unknown;

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [];
    }

    manifest = Object.fromEntries(Object.entries(parsed));
  } catch {
    return [];
  }

  const findings: AppGenerationValidationFinding[] = [];

  if (manifest.app_id !== revision.sourceAppId) {
    findings.push({
      code: 'revision_manifest_app_id_changed',
      severity: 'error',
      message: `Revision manifest app_id must remain ${revision.sourceAppId}.`,
      file: 'manifest.json',
      field: '/app_id',
      fix: `Set manifest app_id back to ${revision.sourceAppId}.`,
      detail: {
        expected: revision.sourceAppId,
        actual: typeof manifest.app_id === 'string' ? manifest.app_id : null,
      },
    });
  }

  if (manifest.version !== revision.targetVersion) {
    findings.push({
      code: 'revision_manifest_version_mismatch',
      severity: 'error',
      message: `Revision manifest version must be ${revision.targetVersion}.`,
      file: 'manifest.json',
      field: '/version',
      fix: `Set manifest version to ${revision.targetVersion}.`,
      detail: {
        sourceVersion: revision.sourceVersion,
        expected: revision.targetVersion,
        actual: typeof manifest.version === 'string' ? manifest.version : null,
      },
    });
  }

  return findings;
}

export function selectAuthoringModeForGeneration(
  sourceCompiler: AppPackageSourceCompiler | undefined,
): AppWriterAuthoringMode {
  return sourceCompiler?.supportsTypeScriptAuthoring === true ? 'typescript' : 'javascript';
}

export function readPlanningFromRun(
  run: AppGenerationRunRecord,
): AppGenerationPlanningResult | null {
  if (
    run.normalizedRequest === null ||
    run.appPlan === null ||
    run.selectedStarterId === null ||
    run.status === 'failed'
  ) {
    return null;
  }

  return {
    normalizedRequest: run.normalizedRequest,
    appPlan: run.appPlan,
    selectedStarterId: run.selectedStarterId,
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Using the existing Lantern app plan.',
      },
    ],
    notes: [...run.generationNotes],
  };
}
