import type { RunAppPackageGenerationResult } from './service.ts';
import type { AppGenerationRunRecord } from './types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';

export async function recordAppWriterWorkflowQueuedEvent(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  workflowInstanceId: string | null;
  summary: string;
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
    summary: input.summary,
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

export function scheduleAppWriterContinuation(
  context: unknown,
  continuation: Promise<RunAppPackageGenerationResult>,
  generationId: string,
  label: 'generation' | 'revision',
): void {
  const handled = continuation
    .then(() => {})
    .catch((error) => {
      console.error(`App writer ${label} ${generationId} failed in background.`, error);
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
