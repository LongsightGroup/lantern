import type { AttemptEvent, Capability } from "../../sdk/app-sdk.ts";
import {
  type AttemptScoreResult,
  loadReviewedRubric,
  scoreAttempt,
} from "../grading/service.ts";
import {
  ensureLineItem,
  publishFinalScore,
  type PublishFinalScoreInput,
  type PublishFinalScoreResult,
  requestCanvasServiceAccessToken,
} from "../lti/services.ts";
import {
  buildLtiActivityResourceId,
  LTI_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE,
  type RuntimeSessionRecord,
} from "../lti/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  AttemptRecord,
  CanvasLineItemBindingRecord,
  DeploymentRecord,
  GradePublicationRecord,
  PackageVersionRecord,
  PreviewSessionRecord,
} from "../package_review/types.ts";

export interface FinalizeAttemptInput {
  completionState: "completed" | "abandoned";
}

export interface FinalizeAttemptResult {
  attempt: AttemptRecord;
  score: AttemptScoreResult;
  finalizedNow: boolean;
  lineItemBinding: CanvasLineItemBindingRecord | null;
  gradePublication: GradePublicationRecord | null;
  gradePublishedNow: boolean;
  publishError: {
    code: string;
    message: string;
    detail: Record<string, unknown>;
  } | null;
}

export interface GovernedGradePublicationInput {
  repository: Pick<PackageReviewRepository, "updateGradePublication">;
  attemptId: string;
  publication: Pick<
    GradePublicationRecord,
    | "lineItemUrl"
    | "canvasUserId"
    | "scoreGiven"
    | "scoreMaximum"
    | "activityProgress"
  >;
  accessToken: string;
  now: () => Date;
  publishScore?: (
    input: PublishFinalScoreInput,
  ) => Promise<PublishFinalScoreResult>;
}

export interface GovernedGradePublicationResult {
  gradePublication: GradePublicationRecord;
  gradePublishedNow: boolean;
  publishError: FinalizeAttemptResult["publishError"];
}

export async function acceptAttemptEvent(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const previewSession = await resolvePreviewSession(
    input.repository,
    input.session,
  );

  try {
    requireRuntimeCapability(input.session, "submit_attempt_event");
    const event = parseAttemptEvent(input.payload);
    const attemptEvent = await input.repository.appendAttemptEvent({
      attemptId: input.session.attemptId,
      event,
      receivedAt: occurredAt,
    });

    if (previewSession !== null) {
      await input.repository.appendPreviewEvidence({
        previewSessionId: previewSession.sessionId,
        eventType: "preview.attempt_event",
        capability: "submit_attempt_event",
        summary: "Recorded preview attempt activity without LMS side effects.",
        detail: {
          attemptId: input.session.attemptId,
          sequence: attemptEvent.sequence,
          eventType: attemptEvent.eventType,
        },
        occurredAt,
      });
    }

    return attemptEvent;
  } catch (error) {
    if (previewSession !== null) {
      await input.repository.appendPreviewEvidence({
        previewSessionId: previewSession.sessionId,
        eventType: "preview.attempt_event.blocked",
        capability: "submit_attempt_event",
        summary: "Blocked preview attempt-event write outside declared capability.",
        detail: {
          attemptId: input.session.attemptId,
          reason: errorMessage(error),
        },
        occurredAt,
      });
    }

    throw error;
  }
}

export async function finalizeRuntimeAttempt(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
  now?: () => Date;
}): Promise<FinalizeAttemptResult> {
  const now = input.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const previewSession = await resolvePreviewSession(
    input.repository,
    input.session,
  );
  let previewBlockEvidenceRecorded = false;

  try {
    requireRuntimeCapability(input.session, "finalize_attempt");
    const finalizeInput = parseFinalizeAttemptInput(input.payload);
    const attempt = await requireRuntimeAttempt(
      input.repository,
      input.session,
    );

    if (previewSession !== null) {
      if (previewSessionHasLiveServicePath(input.session)) {
        await input.repository.appendPreviewEvidence({
          previewSessionId: previewSession.sessionId,
          eventType: "preview.finalize.blocked",
          capability: "finalize_attempt",
          summary: "Blocked preview finalize from attempting live LMS side effects.",
          detail: {
            attemptId: input.session.attemptId,
            hasAgsServices: input.session.services.ags !== null,
            hasNrpsServices: input.session.services.nrps !== null,
          },
          occurredAt,
        });
        previewBlockEvidenceRecorded = true;
        throw new Error("Preview mode blocks live LMS side effects.");
      }

      const finalizedNow = attempt.finalizedAt === null;
      const finalizedAttempt = finalizedNow
        ? await input.repository.finalizeAttempt({
          attemptId: attempt.attemptId,
          status: completionStateToAttemptStatus(finalizeInput.completionState),
          completionState: finalizeInput.completionState,
          finalizedAt: occurredAt,
        })
        : attempt;
      const score: AttemptScoreResult = {
        scoreGiven: 0,
        scoreMaximum: previewSession.fakeScoreMaximum,
      };

      await input.repository.appendPreviewEvidence({
        previewSessionId: previewSession.sessionId,
        eventType: "preview.finalize",
        capability: "finalize_attempt",
        summary:
          "Finalized preview attempt with Lantern fake scoring and no LMS writes.",
        detail: {
          attemptId: finalizedAttempt.attemptId,
          completionState: finalizedAttempt.completionState,
          scoreGiven: score.scoreGiven,
          scoreMaximum: score.scoreMaximum,
          alreadyFinalized: !finalizedNow,
        },
        occurredAt,
      });

      return {
        attempt: finalizedAttempt,
        score,
        finalizedNow,
        lineItemBinding: null,
        gradePublication: null,
        gradePublishedNow: false,
        publishError: null,
      };
    }

    const packageVersion = await requireRuntimePackageVersion(
      input.repository,
      input.session,
    );

    if (packageVersion.grading.mode === "manual") {
      throw new Error(
        "Manual grading cannot be finalized automatically in Phase 3.",
      );
    }

    const finalizedNow = attempt.finalizedAt === null;
    const finalizedAttempt = finalizedNow
      ? await input.repository.finalizeAttempt({
        attemptId: attempt.attemptId,
        status: completionStateToAttemptStatus(finalizeInput.completionState),
        completionState: finalizeInput.completionState,
        finalizedAt: now().toISOString(),
      })
      : attempt;
    const events = await input.repository.listAttemptEvents(
      finalizedAttempt.attemptId,
    );
    const rubric = packageVersion.grading.mode === "declarative"
      ? await loadReviewedRubric({
        snapshotRoot: packageVersion.artifact.snapshotRoot,
        rubricFile: packageVersion.grading.rubricFile,
      })
      : undefined;
    const score = scoreAttempt({
      attempt: finalizedAttempt,
      events,
      grading: packageVersion.grading,
      ...(rubric === undefined ? {} : { rubric }),
    });
    const publishResult = await publishRuntimeAttemptScore({
      repository: input.repository,
      session: input.session,
      attempt: finalizedAttempt,
      packageVersion,
      score,
      now,
    });

    return {
      attempt: finalizedAttempt,
      score,
      finalizedNow,
      ...publishResult,
    };
  } catch (error) {
    if (previewSession !== null && !previewBlockEvidenceRecorded) {
      await input.repository.appendPreviewEvidence({
        previewSessionId: previewSession.sessionId,
        eventType: "preview.finalize.blocked",
        capability: "finalize_attempt",
        summary: "Blocked preview finalize request before any LMS side effect.",
        detail: {
          attemptId: input.session.attemptId,
          reason: errorMessage(error),
        },
        occurredAt,
      });
    }

    throw toFinalizeError(error);
  }
}

export function parseAttemptEvent(payload: unknown): AttemptEvent {
  const record = requireRecord(
    payload,
    "Attempt event payload must be an object.",
  );
  const type = requireString(record.type, "Attempt event type is required.");

  switch (type) {
    case "answer":
      return {
        type,
        questionId: requireString(
          record.questionId,
          "Attempt answer questionId is required.",
        ),
        answer: requireAnswerValue(record.answer),
        timestamp: requireTimestamp(
          record.timestamp,
          "Attempt answer timestamp is required.",
        ),
      };
    case "progress":
      return {
        type,
        checkpoint: requireString(
          record.checkpoint,
          "Attempt progress checkpoint is required.",
        ),
        value: requireNumber(
          record.value,
          "Attempt progress value is required.",
        ),
        timestamp: requireTimestamp(
          record.timestamp,
          "Attempt progress timestamp is required.",
        ),
      };
    case "complete":
      return {
        type,
        timestamp: requireTimestamp(
          record.timestamp,
          "Attempt complete timestamp is required.",
        ),
      };
    default:
      throw new Error(`Unsupported attempt event type ${type}.`);
  }
}

export function parseFinalizeAttemptInput(
  payload: unknown,
): FinalizeAttemptInput {
  if (payload === null || payload === undefined) {
    return { completionState: "completed" };
  }

  const record = requireRecord(
    payload,
    "Finalize payload must be an object when provided.",
  );
  const completionState = record.completionState;

  if (completionState === undefined) {
    return { completionState: "completed" };
  }

  if (completionState !== "completed" && completionState !== "abandoned") {
    throw new Error("Finalize completionState must be completed or abandoned.");
  }

  return { completionState };
}

export function requireRuntimeCapability(
  session: RuntimeSessionRecord,
  capability: Capability,
): void {
  if (!session.capabilities.includes(capability)) {
    throw new Error(`Runtime session does not allow ${capability}.`);
  }
}

export async function publishGovernedGradePublication(
  input: GovernedGradePublicationInput,
): Promise<GovernedGradePublicationResult> {
  const publishScore = input.publishScore ?? publishFinalScore;
  const timestamp = input.now().toISOString();

  try {
    await publishScore({
      accessToken: input.accessToken,
      lineItemUrl: input.publication.lineItemUrl,
      canvasUserId: input.publication.canvasUserId,
      scoreGiven: input.publication.scoreGiven,
      scoreMaximum: input.publication.scoreMaximum,
      activityProgress: input.publication.activityProgress,
      gradingProgress: "FullyGraded",
      timestamp,
    });

    return {
      gradePublication: await input.repository.updateGradePublication({
        attemptId: input.attemptId,
        status: "published",
        updatedAt: timestamp,
        publishedAt: timestamp,
        errorCode: null,
        errorDetail: null,
      }),
      gradePublishedNow: true,
      publishError: null,
    };
  } catch (error) {
    return {
      gradePublication: await input.repository.updateGradePublication({
        attemptId: input.attemptId,
        status: "failed",
        updatedAt: timestamp,
        publishedAt: null,
        errorCode: "score_publish_failed",
        errorDetail: {
          message: errorMessage(error),
        },
      }),
      gradePublishedNow: false,
      publishError: {
        code: "score_publish_failed",
        message: errorMessage(error),
        detail: {
          lineItemUrl: input.publication.lineItemUrl,
        },
      },
    };
  }
}

function requireRecord(
  payload: unknown,
  message: string,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function requireAnswerValue(value: unknown): string | string[] {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (Array.isArray(value)) {
    const answers = value.filter((item): item is string =>
      typeof item === "string" && item.trim() !== ""
    );

    if (answers.length > 0) {
      return answers;
    }
  }

  throw new Error("Attempt answer value is required.");
}

function requireNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(message);
  }

  return value;
}

function requireTimestamp(value: unknown, message: string): string {
  const timestamp = requireString(value, message);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(message);
  }

  return timestamp;
}

async function resolvePreviewSession(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<PreviewSessionRecord | null> {
  if (session.preview === undefined) {
    return null;
  }

  const previewSession = await repository.getPreviewSessionById(
    session.preview.previewSessionId,
  );

  if (previewSession === null) {
    throw new Error(
      `Preview session ${session.preview.previewSessionId} was not found.`,
    );
  }

  if (
    previewSession.appId !== session.appId ||
    previewSession.packageVersionId !== session.packageVersionId ||
    previewSession.packageVersion !== session.packageVersion ||
    !matchesPreviewAttemptId(session.attemptId, previewSession)
  ) {
    throw new Error(
      `Preview session ${previewSession.sessionId} did not match the runtime session context.`,
    );
  }

  return previewSession;
}

function previewSessionHasLiveServicePath(
  session: RuntimeSessionRecord,
): boolean {
  return session.deploymentRecordId !== 0 ||
    session.services.ags !== null ||
    session.services.nrps !== null;
}

function matchesPreviewAttemptId(
  attemptId: string,
  previewSession: PreviewSessionRecord,
): boolean {
  return attemptId === previewSession.fakeAttemptId ||
    attemptId ===
      `${previewSession.fakeAttemptId}:${previewSession.sessionId}`;
}

async function requireRuntimeAttempt(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<AttemptRecord> {
  const attempt = await repository.getAttemptById(session.attemptId);

  if (!attempt) {
    throw new Error(`Attempt ${session.attemptId} was not found.`);
  }

  if (
    attempt.deploymentRecordId !== session.deploymentRecordId ||
    attempt.packageVersionId !== session.packageVersionId ||
    attempt.appId !== session.appId
  ) {
    throw new Error(
      `Attempt ${attempt.attemptId} did not match the runtime session context.`,
    );
  }

  return attempt;
}

async function requireRuntimePackageVersion(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<PackageVersionRecord> {
  const packageVersion = await repository.getPackageVersionById(
    session.packageVersionId,
  );

  if (!packageVersion) {
    throw new Error(
      `Package version ${session.packageVersionId} was not found for finalize.`,
    );
  }

  if (
    packageVersion.appId !== session.appId ||
    packageVersion.version !== session.packageVersion
  ) {
    throw new Error(
      `Package version ${session.packageVersionId} did not match the runtime session context.`,
    );
  }

  return packageVersion;
}

function completionStateToAttemptStatus(
  completionState: FinalizeAttemptInput["completionState"],
): AttemptRecord["status"] {
  return completionState === "completed" ? "completed" : "abandoned";
}

async function publishRuntimeAttemptScore(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  attempt: AttemptRecord;
  packageVersion: PackageVersionRecord;
  score: AttemptScoreResult;
  now: () => Date;
}): Promise<
  Pick<
    FinalizeAttemptResult,
    | "lineItemBinding"
    | "gradePublication"
    | "gradePublishedNow"
    | "publishError"
  >
> {
  const deployment = await requireRuntimeDeployment(
    input.repository,
    input.session,
  );

  if (deployment.binding === null) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: "missing_binding",
        message:
          "Canvas deployment binding is required before score publish can continue.",
        detail: {
          deploymentSlug: deployment.slug,
        },
      },
    };
  }

  const ags = input.session.services.ags;

  if (ags === null) {
    return {
      lineItemBinding: null,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: "missing_ags_context",
        message:
          "Launch did not provide Canvas AGS service context for this attempt.",
        detail: {
          attemptId: input.attempt.attemptId,
        },
      },
    };
  }

  const hasExistingBinding = await input.repository.getLineItemBinding({
    deploymentRecordId: input.session.deploymentRecordId,
    packageVersionId: input.session.packageVersionId,
    contextId: input.attempt.contextId,
    resourceLinkId: input.attempt.resourceLinkId,
    activityId: input.attempt.activityId,
  });
  const hasScoreScope = ags.scope.includes(LTI_AGS_SCORE_SCOPE);
  const requiresLineitemScope = hasExistingBinding === null &&
    ags.lineitemUrl === null;

  if (
    !hasScoreScope || (requiresLineitemScope &&
      !ags.scope.includes(LTI_AGS_LINEITEM_SCOPE))
  ) {
    return {
      lineItemBinding: hasExistingBinding,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: "missing_ags_scope",
        message:
          "Launch did not grant the AGS scopes Lantern needs to publish the final score.",
        detail: {
          scopes: ags.scope,
        },
      },
    };
  }

  let accessToken: string;

  try {
    const token = await requestCanvasServiceAccessToken({
      issuer: deployment.binding.issuer,
      clientId: deployment.binding.clientId,
      scopes: ags.scope,
    });

    accessToken = token.accessToken;
  } catch (error) {
    return {
      lineItemBinding: hasExistingBinding,
      gradePublication: null,
      gradePublishedNow: false,
      publishError: {
        code: "token_request_failed",
        message: errorMessage(error),
        detail: {
          issuer: deployment.binding.issuer,
          clientId: deployment.binding.clientId,
        },
      },
    };
  }

  let lineItemBinding = hasExistingBinding;

  if (lineItemBinding === null) {
    try {
      const ensuredLineItem = await ensureLineItem({
        accessToken,
        lineitemsUrl: ags.lineitemsUrl,
        lineitemUrl: ags.lineitemUrl,
        resourceLinkId: input.attempt.resourceLinkId,
        resourceId: buildLineItemResourceId(input.session),
        tag: "final-grade",
        label: `${input.packageVersion.title} Final Grade`,
        scoreMaximum: input.score.scoreMaximum,
      });

      lineItemBinding = await input.repository.saveLineItemBinding({
        deploymentRecordId: input.session.deploymentRecordId,
        packageVersionId: input.session.packageVersionId,
        contextId: input.attempt.contextId,
        resourceLinkId: input.attempt.resourceLinkId,
        activityId: input.attempt.activityId,
        lineItemsUrl: ensuredLineItem.lineItemsUrl,
        lineItemUrl: ensuredLineItem.lineItemUrl,
        resourceId: ensuredLineItem.resourceId,
        tag: ensuredLineItem.tag,
        label: ensuredLineItem.label,
        scoreMaximum: ensuredLineItem.scoreMaximum,
        createdAt: input.now().toISOString(),
        updatedAt: input.now().toISOString(),
      });
    } catch (error) {
      return {
        lineItemBinding: null,
        gradePublication: null,
        gradePublishedNow: false,
        publishError: {
          code: "line_item_failed",
          message: errorMessage(error),
          detail: {
            attemptId: input.attempt.attemptId,
          },
        },
      };
    }
  }

  const existingPublication = await input.repository
    .getGradePublicationByAttemptId(
      input.attempt.attemptId,
    );

  if (existingPublication?.status === "published") {
    return {
      lineItemBinding,
      gradePublication: existingPublication,
      gradePublishedNow: false,
      publishError: null,
    };
  }

  const gradePublication = existingPublication ??
    await input.repository.createGradePublication({
      attemptId: input.attempt.attemptId,
      lineItemBindingId: lineItemBinding.id,
      lineItemUrl: lineItemBinding.lineItemUrl,
      canvasUserId: input.attempt.userId,
      scoreGiven: input.score.scoreGiven,
      scoreMaximum: input.score.scoreMaximum,
      activityProgress: resolveActivityProgress(input.attempt),
      gradingProgress: "Pending",
      status: "pending",
      createdAt: input.now().toISOString(),
      updatedAt: input.now().toISOString(),
      publishedAt: null,
      errorCode: null,
      errorDetail: null,
    });
  const published = await publishGovernedGradePublication({
    repository: input.repository,
    attemptId: input.attempt.attemptId,
    publication: gradePublication,
    accessToken,
    now: input.now,
  });

  return {
    lineItemBinding,
    ...published,
  };
}

async function requireRuntimeDeployment(
  repository: PackageReviewRepository,
  session: RuntimeSessionRecord,
): Promise<DeploymentRecord> {
  const deployment = await repository.getDeploymentBySlug(
    session.deploymentSlug,
  );

  if (!deployment) {
    throw new Error(
      `Deployment ${session.deploymentSlug} was not found for finalize.`,
    );
  }

  if (deployment.id !== session.deploymentRecordId) {
    throw new Error(
      `Deployment ${deployment.slug} did not match the runtime session context.`,
    );
  }

  return deployment;
}

function buildLineItemResourceId(session: RuntimeSessionRecord): string {
  return buildLtiActivityResourceId({
    appId: session.appId,
    packageVersion: session.packageVersion,
    activityId: session.launch.activityId,
  });
}

function resolveActivityProgress(
  attempt: AttemptRecord,
): GradePublicationRecord["activityProgress"] {
  return attempt.completionState === "completed" ? "Completed" : "InProgress";
}

function toFinalizeError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Finalize ")) {
    return error;
  }

  return new Error(`Finalize blocked: ${errorMessage(error)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown finalize error.";
}
