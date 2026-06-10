import type { Hono } from '@hono/hono';
import { listGenerationActivityEvents } from './app_writer/service_activity.ts';
import {
  AppPackageGenerationFailedError,
  startAppPackageGenerationRun,
} from './app_writer/service.ts';
import type { RunAppPackageGenerationResult } from './app_writer/service.ts';
import {
  renderAppGenerationRunPage,
  renderAppWriterPage,
  renderAppWriterPlanPreviewPage,
} from './admin/app_writer_page.ts';
import { createErrorNotice } from './app_notice_support.ts';
import { loadPreviewCapabilityLog } from './app_deployment_support.ts';
import { formValueAsString, requireTrimmedFormValue } from './app_request_support.ts';
import { statusForError } from './app_status_support.ts';
import type { AppServices } from './app_services.ts';
import { type AppWriterSelectedContext, selectAppWriterContext } from './app_writer/context.ts';
import { buildLanternOwnedAppGenerationPlanningResult } from './app_writer/planning.ts';
import type { AppGenerationRunRecord } from './app_writer/types.ts';
import type { AppGenerationPlanningResult, AppWriterAuthoringMode } from './app_writer/types.ts';
import type { PackageReviewRepository } from './package_review/repository.ts';

export function registerAdminAppWriterRoutes(app: Hono, services: AppServices): void {
  app.get('/admin/app-writer', (context) => {
    return context.html(renderAppWriterPage());
  });

  app.post('/admin/app-writer', async (context) => {
    let promptText = '';
    let audience = '';
    let contentSummary = '';
    let gradingMode = '';
    let requestedAppId = '';

    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      promptText = requireTrimmedFormValue(
        formData.get('promptText'),
        'Describe the learning app Lantern should generate.',
      );
      audience = normalizeOptionalFormValue(formData.get('audience'));
      contentSummary = normalizeOptionalFormValue(formData.get('contentSummary'));
      gradingMode = normalizeOptionalGradingMode(formData.get('gradingMode'));
      requestedAppId = normalizeOptionalFormValue(formData.get('requestedAppId'));
      const action = normalizeAppWriterAction(formData.get('appWriterAction'));
      const generationPromptText = formatGenerationPromptText({
        promptText,
        audience,
        contentSummary,
        gradingMode,
      });
      const planPreview = buildDeterministicPlanPreview({
        services,
        promptText: generationPromptText,
        requestedAppId: requestedAppId === '' ? null : requestedAppId,
      });

      if (action === 'preview') {
        return context.html(
          renderAppWriterPlanPreviewPage({
            promptText,
            audience,
            contentSummary,
            gradingMode,
            requestedAppId,
            planning: planPreview.planning,
            selectedContext: planPreview.selectedContext,
          }),
        );
      }

      const generationId = `generation-${crypto.randomUUID()}`;

      const started = await startAppPackageGenerationRun({
        repository,
        workspaceRunner: services.appWriterWorkspaceRunner,
        previewer: services.appPackagePreviewer,
        sourceCompiler: services.appPackageSourceCompiler,
        savePackage: {
          importPackageFromSource: services.importPackageFromSource,
        },
        generationId,
        ownerId: 'admin',
        promptText: generationPromptText,
        requestedAppId: requestedAppId === '' ? null : requestedAppId,
      });
      const scheduleResult = await services.appGenerationRunScheduler.schedule({
        generationId: started.run.generationId,
      });

      if (scheduleResult.mode === 'workflow') {
        await recordWorkflowQueuedEvent({
          repository,
          run: started.run,
          workflowInstanceId: scheduleResult.workflowInstanceId,
        });
      } else {
        scheduleGenerationContinuation(
          context,
          started.continueGeneration(),
          started.run.generationId,
        );
      }

      await services.appWriterAgentSessions.observe({
        generationId: started.run.generationId,
        ownerId: started.run.ownerId,
        workflowInstanceId: scheduleResult.mode === 'workflow'
          ? scheduleResult.workflowInstanceId
          : null,
        observedAt: started.run.updatedAt,
      });

      return context.redirect(`/admin/app-writer/runs/${started.run.generationId}`, 303);
    } catch (error) {
      if (error instanceof AppPackageGenerationFailedError) {
        return context.redirect(`/admin/app-writer/runs/${error.run.generationId}`, 303);
      }

      return context.html(
        renderAppWriterPage({
          promptText,
          audience,
          contentSummary,
          gradingMode,
          requestedAppId,
          notice: createErrorNotice('App generation blocked', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/app-writer/runs/:generationId', async (context) => {
    const repository = services.getRepository();
    const generationId = context.req.param('generationId');

    try {
      const run = await repository.getAppGenerationRunById(generationId);

      if (run === null) {
        return context.html(
          renderAppWriterPage({
            notice: {
              tone: 'error',
              title: 'Generation run not found',
              detail: 'Lantern could not find that app writer run.',
            },
          }),
          404,
        );
      }

      const packageVersion = run.packageVersionId === null
        ? null
        : await repository.getPackageVersionById(run.packageVersionId);
      const workspace = await repository.getAppGenerationWorkspaceByGenerationId(generationId);
      const activityEvents = await listGenerationActivityEvents(repository, generationId);
      const runtimeLog = packageVersion === null
        ? { session: null, evidence: [] }
        : await loadPreviewCapabilityLog({
          repository,
          packageVersionId: packageVersion.id,
        });

      return context.html(
        renderAppGenerationRunPage({
          run,
          workspace,
          packageVersion,
          latestPreviewSession: runtimeLog.session,
          previewEvidence: runtimeLog.evidence,
          activityEvents,
        }),
      );
    } catch (error) {
      return context.html(
        renderAppWriterPage({
          notice: createErrorNotice('Generation run unavailable', error),
        }),
        statusForError(error),
      );
    }
  });

  app.get('/admin/app-writer/runs/:generationId/events', (context) => {
    return services.appWriterAgentSessions.fetchEvents(
      context.req.param('generationId'),
      context.req.raw,
    );
  });
}

async function recordWorkflowQueuedEvent(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  workflowInstanceId: string | null;
}): Promise<void> {
  await input.repository.recordAuditEvent({
    eventType: 'app_generation.generating',
    actorType: 'user',
    actorId: input.run.ownerId,
    deploymentRecordId: null,
    packageVersionId: input.run.packageVersionId,
    attemptId: null,
    lineItemBindingId: null,
    status: 'accepted',
    summary: 'Queued app writer generation in Cloudflare Workflow.',
    detail: {
      generationId: input.run.generationId,
      generationStatus: input.run.status,
      requestedAppId: input.run.requestedAppId,
      generatedAppId: input.run.generatedAppId,
      selectedStarterId: input.run.selectedStarterId,
      repairAttemptCount: input.run.repairAttemptCount,
      findingCount: input.run.validationFindings.length,
      workflowInstanceId: input.workflowInstanceId,
      backgroundRunner: 'workflow',
    },
    occurredAt: input.run.updatedAt,
  });
}

function scheduleGenerationContinuation(
  context: unknown,
  continuation: Promise<RunAppPackageGenerationResult>,
  generationId: string,
): void {
  const handled = continuation
    .then(() => {})
    .catch((error) => {
      console.error(`App writer generation ${generationId} failed in background.`, error);
    });
  const executionContext = readExecutionContext(context);

  if (executionContext !== null) {
    executionContext.waitUntil(handled);
    return;
  }

  void handled;
}

function readExecutionContext(
  context: unknown,
): { waitUntil(promise: Promise<void>): void } | null {
  try {
    const candidate = (context as { executionCtx?: unknown }).executionCtx;

    if (
      candidate !== null &&
      typeof candidate === 'object' &&
      typeof (candidate as { waitUntil?: unknown }).waitUntil === 'function'
    ) {
      return candidate as { waitUntil(promise: Promise<void>): void };
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeAppWriterAction(value: FormDataEntryValue | null): 'preview' | 'generate' {
  const normalized = normalizeOptionalFormValue(value);

  if (normalized === '' || normalized === 'preview') {
    return 'preview';
  }

  if (normalized === 'generate') {
    return 'generate';
  }

  throw new Error('Choose whether to preview the app plan or generate the app.');
}

function normalizeOptionalFormValue(value: FormDataEntryValue | null): string {
  return formValueAsString(value)?.trim() ?? '';
}

function normalizeOptionalGradingMode(value: FormDataEntryValue | null): string {
  const normalized = normalizeOptionalFormValue(value);

  if (
    normalized === '' ||
    normalized === 'completion' ||
    normalized === 'declarative' ||
    normalized === 'browser'
  ) {
    return normalized;
  }

  throw new Error('Choose a supported app writer grading mode.');
}

function formatGenerationPromptText(input: {
  promptText: string;
  audience: string;
  contentSummary: string;
  gradingMode: string;
}): string {
  const details = [
    input.audience === '' ? null : `Audience: ${input.audience}`,
    input.contentSummary === '' ? null : `Content: ${input.contentSummary}`,
    input.gradingMode === '' ? null : `Preferred grading: ${input.gradingMode}`,
  ].filter((detail): detail is string => detail !== null);

  if (details.length === 0) {
    return input.promptText;
  }

  return `${input.promptText}\n\nGeneration request details:\n${details.join('\n')}`;
}

function buildDeterministicPlanPreview(input: {
  services: AppServices;
  promptText: string;
  requestedAppId: string | null;
}): {
  planning: AppGenerationPlanningResult;
  selectedContext: AppWriterSelectedContext;
} {
  const authoringMode = selectAuthoringModeForPlanPreview(input.services);
  const contextSelection = selectAppWriterContext({
    promptText: input.promptText,
    requestedAppId: input.requestedAppId,
    authoringMode,
  });

  return {
    selectedContext: contextSelection.selectedContext,
    planning: buildLanternOwnedAppGenerationPlanningResult({
      generationId: 'plan-preview',
      ownerId: 'admin',
      promptText: input.promptText,
      requestedAppId: input.requestedAppId,
      selectedStarterId: contextSelection.starterId,
      selectedContext: contextSelection.selectedContext,
      authoringMode,
      createdAt: new Date(0).toISOString(),
    }),
  };
}

function selectAuthoringModeForPlanPreview(services: AppServices): AppWriterAuthoringMode {
  return services.appPackageSourceCompiler.supportsTypeScriptAuthoring
    ? 'typescript'
    : 'javascript';
}
