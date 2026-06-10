import type { AppGenerationProgressUpdate, AppGenerationRunRecord } from './types.ts';
import type { AppGenerationAuditEventType } from './service_constants.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AuditEventStatus } from '../package_review/types.ts';

export async function recordGenerationActivity(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  eventType: AppGenerationAuditEventType;
  status: AuditEventStatus;
  summary: string;
  packageVersionId?: number | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await input.repository.recordAuditEvent({
    eventType: input.eventType,
    actorType: 'user',
    actorId: input.run.ownerId,
    deploymentRecordId: null,
    packageVersionId: input.packageVersionId ?? input.run.packageVersionId,
    attemptId: null,
    lineItemBindingId: null,
    status: input.status,
    summary: input.summary,
    detail: {
      generationId: input.run.generationId,
      generationStatus: input.run.status,
      requestedAppId: input.run.requestedAppId,
      generatedAppId: input.run.generatedAppId,
      selectedStarterId: input.run.selectedStarterId,
      repairAttemptCount: input.run.repairAttemptCount,
      findingCount: input.run.validationFindings.length,
      ...input.detail,
    },
    occurredAt: input.run.updatedAt,
  });
}

export async function recordGenerationProgressUpdates(input: {
  repository: Pick<PackageReviewRepository, 'recordAuditEvent'>;
  run: AppGenerationRunRecord;
  eventType: AppGenerationAuditEventType;
  updates: AppGenerationProgressUpdate[];
}): Promise<void> {
  for (const update of input.updates) {
    await recordGenerationActivity({
      repository: input.repository,
      run: input.run,
      eventType: input.eventType,
      status: 'succeeded',
      summary: update.message,
      detail: {
        modelProgress: true,
        modelProgressStage: update.stage,
      },
    });
  }
}
