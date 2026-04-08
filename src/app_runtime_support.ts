import type {
  BrowserGraderResult,
  Capability,
  ScoreProposal,
  SubmissionMode,
} from "../sdk/app-sdk.ts";
import type { RuntimeSessionRecord } from "./lti/types.ts";
import type { PackageReviewRepository } from "./package_review/repository.ts";
import type { AuditEventStatus } from "./package_review/types.ts";
import type { RequestAuditEnvelope } from "./request_audit.ts";
import {
  buildRuntimeDetailRecord,
  failRuntimeOutcome,
  isRuntimeBrokerDenialError,
  isRuntimeOutcomeError,
} from "./runtime/gateway_errors.ts";
import {
  RUNTIME_BOUNDARY,
  RUNTIME_SANDBOX_MODEL,
} from "./runtime/gateway_types.ts";

export async function requireRuntimeSession(
  repository: PackageReviewRepository,
  sessionId: string,
): Promise<RuntimeSessionRecord> {
  const session = await repository.getRuntimeSessionById(sessionId);

  if (!session) {
    failRuntimeOutcome({
      type: "deny",
      code: "session_missing",
      message: `Runtime session ${sessionId} was not found.`,
      status: 404,
      detail: {
        sessionId,
      },
    });
  }

  return session;
}

export async function resolveRuntimeSessionForAudit(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord | null,
  sessionId: string,
): Promise<RuntimeSessionRecord | null> {
  if (session !== null) {
    return session;
  }

  return await repository.getRuntimeSessionById(sessionId);
}

export async function recordRuntimeSessionStarted(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  runtimeOrigin: string;
  route: string;
  occurredAt?: string;
}): Promise<void> {
  await recordRuntimeAuditEvent({
    repository: input.repository,
    session: input.session,
    eventType: "runtime.session.started",
    status: "accepted",
    summary:
      "Started the reviewed runtime session inside Lantern's contained browser boundary.",
    occurredAt: input.occurredAt,
    detail: {
      route: input.route,
      runtimeOrigin: input.runtimeOrigin,
      capabilityCount: input.session.capabilities.length,
    },
  });
}

export async function recordRuntimeCapabilityAllowed(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  capability: Capability;
  route: string;
  occurredAt?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
}): Promise<void> {
  await recordRuntimeAuditEvent({
    repository: input.repository,
    session: input.session,
    eventType: "runtime.capability.allowed",
    status: "accepted",
    summary: `Allowed reviewed app capability ${input.capability}.`,
    occurredAt: input.occurredAt,
    detail: {
      route: input.route,
      capability: input.capability,
      ...input.detail,
    },
  });
}

export async function recordRuntimeScoreProposalAccepted(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  scoreProposal: ScoreProposal;
  route: string;
  occurredAt?: string;
}): Promise<void> {
  await recordRuntimeAuditEvent({
    repository: input.repository,
    session: input.session,
    eventType: "runtime.score_proposal.accepted",
    status: "accepted",
    summary:
      "Accepted an app score proposal without granting direct grade-write power.",
    occurredAt: input.occurredAt,
    detail: {
      route: input.route,
      scoreGiven: input.scoreProposal.scoreGiven,
      scoreMaximum: input.scoreProposal.scoreMaximum,
    },
  });
}

export async function recordRuntimeSessionExited(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  completionState: "completed" | "abandoned" | null;
  scoreGiven: number;
  scoreMaximum: number;
  gradePublished: boolean;
  submissionMode: SubmissionMode;
  evidenceArtifactCount?: number;
  evidenceArtifacts?: Array<{
    artifactId: string;
    kind: string;
    fileName: string;
  }>;
  browserGraderResult?: BrowserGraderResult | null;
  route: string;
  occurredAt?: string;
}): Promise<void> {
  await recordRuntimeAuditEvent({
    repository: input.repository,
    session: input.session,
    eventType: "runtime.session.exited",
    status: "accepted",
    summary: "Exited the reviewed runtime through Lantern's finalize boundary.",
    occurredAt: input.occurredAt,
    detail: {
      route: input.route,
      completionState: input.completionState,
      scoreGiven: input.scoreGiven,
      scoreMaximum: input.scoreMaximum,
      gradePublished: input.gradePublished,
      submissionMode: input.submissionMode,
      evidenceArtifactCount: input.evidenceArtifactCount ?? 0,
      evidenceArtifacts: input.evidenceArtifacts ?? [],
      ...(input.browserGraderResult === undefined
        ? {}
        : { browserGraderResult: input.browserGraderResult }),
    },
  });
}

export async function recordRuntimeRouteFailure(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord | null;
  error: unknown;
  route: string;
  request: RequestAuditEnvelope;
  occurredAt?: string;
}): Promise<void> {
  if (input.session === null) {
    return;
  }

  if (isRuntimeBrokerDenialError(input.error)) {
    await recordRuntimeAuditEvent({
      repository: input.repository,
      session: input.session,
      eventType: input.error.capability === null
        ? "runtime.session.denied"
        : "runtime.capability.denied",
      status: "failed",
      summary: input.error.capability === null
        ? "Denied reviewed runtime session access."
        : `Denied reviewed app capability ${input.error.capability}.`,
      occurredAt: input.occurredAt,
      detail: {
        route: input.route,
        category: input.error.category,
        code: input.error.code,
        capability: input.error.capability,
        request: input.request,
        ...input.error.detail,
      },
    });
  }

  if (isRuntimeOutcomeError(input.error)) {
    const eventType = input.error.type === "timeout"
      ? "runtime.session.timeout"
      : input.error.type === "integrity_failure"
      ? "runtime.session.integrity_failed"
      : "runtime.session.denied";
    const summary = input.error.type === "timeout"
      ? "Runtime session expired before the reviewed app could continue."
      : input.error.type === "integrity_failure"
      ? "Reviewed runtime integrity checks blocked this session."
      : "Denied reviewed runtime session access.";

    await recordRuntimeAuditEvent({
      repository: input.repository,
      session: input.session,
      eventType,
      status: "failed",
      summary,
      occurredAt: input.occurredAt,
      detail: {
        route: input.route,
        code: input.error.code,
        request: input.request,
        ...input.error.detail,
      },
    });
  }
}

async function recordRuntimeAuditEvent(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  eventType: string;
  status: AuditEventStatus;
  summary: string;
  occurredAt: string | undefined;
  detail: Record<string, unknown>;
}): Promise<void> {
  await input.repository.recordAuditEvent({
    eventType: input.eventType,
    actorType: "system",
    actorId: null,
    deploymentRecordId: input.session.deploymentRecordId,
    packageVersionId: input.session.packageVersionId,
    attemptId: input.session.attemptId,
    lineItemBindingId: null,
    status: input.status,
    summary: input.summary,
    detail: buildRuntimeDetailRecord({
      sessionId: input.session.sessionId,
      sandboxModel: RUNTIME_SANDBOX_MODEL,
      boundary: RUNTIME_BOUNDARY,
      ...input.detail,
    }),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
}
