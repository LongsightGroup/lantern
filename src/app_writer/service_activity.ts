import { APP_GENERATION_AUDIT_EVENT_TYPES } from './service_constants.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AuditEventRecord } from '../package_review/types.ts';

export async function listGenerationActivityEvents(
  repository: Pick<PackageReviewRepository, 'listAuditEventsByEventType'>,
  generationId: string,
): Promise<AuditEventRecord[]> {
  const eventBatches = await Promise.all(
    APP_GENERATION_AUDIT_EVENT_TYPES.map((eventType) =>
      repository.listAuditEventsByEventType(eventType)
    ),
  );

  return eventBatches
    .flat()
    .filter((event) => event.detail.generationId === generationId)
    .sort((left, right) => {
      const timeOrder = left.occurredAt.localeCompare(right.occurredAt);

      return timeOrder === 0 ? left.id - right.id : timeOrder;
    });
}

export async function summarizeGenerationActivityEvents(
  repository: Pick<PackageReviewRepository, 'listAuditEventsByEventType'>,
  generationId: string,
): Promise<{ count: number; lastSummary: string | null }> {
  const events = await listGenerationActivityEvents(repository, generationId);
  const latestEvent = events.at(-1);

  return {
    count: events.length,
    lastSummary: latestEvent?.summary ?? null,
  };
}
