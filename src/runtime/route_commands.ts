import {
  recordRuntimeCapabilityAllowed,
  recordRuntimeScoreProposalAccepted,
  recordRuntimeSessionExited,
} from '../app_runtime_support.ts';
import type { EnvReader } from '../platform/env.ts';
import type { LanternLtiToolContext } from '../lti/tool_provider.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import type { RequestAuditEnvelope } from '../request_audit.ts';
import type { RuntimeArtifactStore } from './artifact_store.ts';
import type { RuntimeDeliveryDescriptor } from './delivery.ts';
import { acceptAttemptEvent, finalizeRuntimeAttempt, submitScoreProposal } from './gateway.ts';

export async function acceptRuntimeAttemptEvent(input: {
  readonly repository: PackageReviewRepository;
  readonly session: RuntimeSessionRecord;
  readonly payload: unknown;
  readonly now?: () => Date;
}): Promise<void> {
  const now = input.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const attemptEvent = await acceptAttemptEvent({
    repository: input.repository,
    session: input.session,
    payload: input.payload,
    now,
  });

  await input.repository.recordAuditEvent({
    eventType: 'attempt.submitted',
    actorType: 'system',
    actorId: null,
    packageVersionId: input.session.packageVersionId,
    attemptId: input.session.attemptId,
    status: 'accepted',
    summary: 'Accepted attempt submission through the runtime gateway.',
    detail: {
      sequence: attemptEvent.sequence,
      eventType: attemptEvent.eventType,
    },
    occurredAt,
  });
  await recordRuntimeCapabilityAllowed({
    repository: input.repository,
    session: input.session,
    capability: 'submit_attempt_event',
    route: 'attempt-events',
    detail: {
      eventType: attemptEvent.eventType,
      sequence: attemptEvent.sequence,
    },
    occurredAt,
  });
}

export async function acceptRuntimeScoreProposal(input: {
  readonly repository: PackageReviewRepository;
  readonly session: RuntimeSessionRecord;
  readonly payload: unknown;
  readonly now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const result = await submitScoreProposal({
    repository: input.repository,
    session: input.session,
    payload: input.payload,
    now,
  });

  if (result.accepted) {
    await recordRuntimeScoreProposalAccepted({
      repository: input.repository,
      session: input.session,
      scoreProposal: result.scoreProposal,
      route: 'score-proposal',
      occurredAt,
    });
  }

  return result;
}

export async function finalizeRuntimeSession(input: {
  readonly env: EnvReader;
  readonly getLtiToolContext?: () => Promise<LanternLtiToolContext>;
  readonly artifactStore: RuntimeArtifactStore;
  readonly repository: PackageReviewRepository;
  readonly session: RuntimeSessionRecord;
  readonly payload: unknown;
  readonly reviewedPackage: PackageVersionRecord | null;
  readonly delivery: RuntimeDeliveryDescriptor;
  readonly request: RequestAuditEnvelope;
  readonly now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const result = await finalizeRuntimeAttempt({
    repository: input.repository,
    session: input.session,
    payload: input.payload,
    env: input.env,
    ...(input.getLtiToolContext === undefined
      ? {}
      : {
          getLtiToolContext: input.getLtiToolContext,
        }),
    artifactStore: input.artifactStore,
    now,
  });

  if (result.finalizedNow) {
    await input.repository.recordAuditEvent({
      eventType: 'attempt.finalized',
      actorType: 'system',
      actorId: null,
      packageVersionId: input.session.packageVersionId,
      attemptId: input.session.attemptId,
      status: 'accepted',
      summary: 'Finalized the durable attempt inside the runtime gateway.',
      detail: buildFinalizeAuditDetail(result),
      occurredAt,
    });
    await recordRuntimeSessionExited({
      repository: input.repository,
      session: input.session,
      reviewedPackage: input.reviewedPackage,
      delivery: input.delivery,
      completionState: result.attempt.completionState,
      scoreGiven: result.score.scoreGiven,
      scoreMaximum: result.score.scoreMaximum,
      gradePublished: false,
      submissionMode: result.submissionMode,
      evidenceArtifactCount: result.evidenceArtifacts.length,
      evidenceArtifacts: result.evidenceArtifacts,
      browserGraderResult: result.browserGraderResult,
      route: 'finalize',
      occurredAt,
    });
  }

  return result;
}

function buildFinalizeAuditDetail(
  result: Awaited<ReturnType<typeof finalizeRuntimeAttempt>>,
): Record<string, unknown> {
  return {
    completionState: result.attempt.completionState,
    scoreGiven: result.score.scoreGiven,
    scoreMaximum: result.score.scoreMaximum,
    submissionMode: result.submissionMode,
    evidenceArtifactCount: result.evidenceArtifacts.length,
    evidenceArtifacts: result.evidenceArtifacts,
    ...(result.browserGraderResult === null
      ? {}
      : { browserGraderResult: result.browserGraderResult }),
  };
}
