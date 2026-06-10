import type { AppWriterContextSelection } from './context.ts';
import type {
  AppGenerationRunRecord,
  AppGenerationValidationFinding,
  AppPackageGenerationResult,
  AppPackagePreviewResult,
} from './types.ts';
import { recordGenerationActivity } from './service_audit.ts';
import type { RunAppPackageGenerationInput } from './service_core.ts';
import { updateGenerationPlanStepInWorkspace } from './service_workspace_snapshot.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';

export async function previewGeneratedPackage(input: {
  input: RunAppPackageGenerationInput;
  contextSelection: AppWriterContextSelection;
  generation: AppPackageGenerationResult;
  run: AppGenerationRunRecord;
  validationFindings: AppGenerationValidationFinding[];
  now: () => string;
}): Promise<{
  run: AppGenerationRunRecord;
  findings: AppGenerationValidationFinding[];
}> {
  if (input.input.previewer === undefined) {
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run: input.run,
      id: 'preview_runtime',
      status: 'skipped',
      now: input.run.updatedAt,
      summary: 'Preview is not configured for this generation run.',
    });
    return {
      run: input.run,
      findings: input.validationFindings,
    };
  }

  let run = await input.input.repository.updateAppGenerationRun({
    ...input.run,
    status: 'previewing',
    updatedAt: input.now(),
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run,
    id: 'preview_runtime',
    status: 'running',
    now: run.updatedAt,
  });
  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.previewing',
    status: 'accepted',
    summary: 'Started Lantern preview checks for the generated package.',
  });

  const previewResult = await input.input.previewer.preview({
    generationId: input.input.generationId,
    selectedStarterId: input.contextSelection.starterId,
    files: selectPackageWorkspaceFiles(input.generation.files),
  });
  const previewFindings = previewResult.validationFindings;
  const findings = [...input.validationFindings, ...previewFindings];
  const previewStepResult = buildPreviewStepResult(previewResult);

  if (previewFindings.length > 0) {
    run = await input.input.repository.updateAppGenerationRun({
      ...run,
      validationFindings: findings,
      updatedAt: input.now(),
    });
    await recordGenerationActivity({
      repository: input.input.repository,
      run,
      eventType: 'app_generation.previewing',
      status: 'failed',
      summary: 'Generated package failed Lantern preview checks.',
    });
    await updateGenerationPlanStepInWorkspace({
      repository: input.input.repository,
      run,
      id: 'preview_runtime',
      status: 'failed',
      now: run.updatedAt,
      diagnosticCount: previewFindings.length,
      result: previewStepResult,
    });

    return { run, findings };
  }

  await recordGenerationActivity({
    repository: input.input.repository,
    run,
    eventType: 'app_generation.previewing',
    status: 'succeeded',
    summary: 'Generated package passed Lantern preview checks.',
  });
  await updateGenerationPlanStepInWorkspace({
    repository: input.input.repository,
    run,
    id: 'preview_runtime',
    status: 'succeeded',
    now: run.updatedAt,
    result: previewStepResult,
  });

  return { run, findings };
}

function buildPreviewStepResult(result: AppPackagePreviewResult): Record<string, unknown> {
  return {
    assertionCount: result.assertionCount,
    passedAssertionCount: result.passedAssertionCount,
    runtimeLogCount: result.runtimeLog.length,
    summary: result.summary,
    runtimeLog: result.runtimeLog.slice(0, 10),
  };
}
