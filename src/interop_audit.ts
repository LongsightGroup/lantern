import type { PackageReviewRepository } from "./package_review/repository.ts";
import type { AuditActorType } from "./package_review/types.ts";

export async function recordInteropPathUsed(input: {
  repository: Pick<PackageReviewRepository, "recordAuditEvent">;
  scope: string;
  path: string;
  actorType: AuditActorType;
  actorId?: string | null;
  deploymentRecordId?: number | null;
  packageVersionId?: number | null;
  attemptId?: string | null;
  lineItemBindingId?: number | null;
  summary?: string;
  detail?: Record<string, unknown>;
  occurredAt?: string;
}): Promise<void> {
  await input.repository.recordAuditEvent({
    eventType: "interop.path_used",
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    deploymentRecordId: input.deploymentRecordId ?? null,
    packageVersionId: input.packageVersionId ?? null,
    attemptId: input.attemptId ?? null,
    lineItemBindingId: input.lineItemBindingId ?? null,
    status: "accepted",
    summary: input.summary ?? "Lantern used an LTI interoperability path.",
    detail: {
      scope: input.scope,
      path: input.path,
      ...(input.detail ?? {}),
    },
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
}
