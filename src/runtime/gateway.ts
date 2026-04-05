import {
  type AttemptScoreResult,
  loadReviewedRubric,
  scoreAttempt,
} from "../grading/service.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type { AttemptRecord } from "../package_review/types.ts";
import {
  previewSessionHasLiveServicePath,
  requireRuntimeAttempt,
  requireRuntimePackageVersion,
  resolvePreviewSession,
} from "./gateway_context.ts";
import { errorMessage, toFinalizeError } from "./gateway_errors.ts";
import {
  parseAttemptEvent,
  parseAttemptLocalState,
  parseFinalizeAttemptInput,
  requireRuntimeCapability,
} from "./gateway_parsing.ts";
import { publishRuntimeAttemptScore } from "./gateway_publication.ts";
import type {
  FinalizeAttemptInput,
  FinalizeAttemptResult,
} from "./gateway_types.ts";
export type {
  FinalizeAttemptInput,
  FinalizeAttemptResult,
  GovernedGradePublicationInput,
  GovernedGradePublicationResult,
} from "./gateway_types.ts";
export {
  parseAttemptEvent,
  parseAttemptLocalState,
  parseFinalizeAttemptInput,
  requireRuntimeCapability,
} from "./gateway_parsing.ts";
export { publishGovernedGradePublication } from "./gateway_publication.ts";

export async function readAttemptLocalState(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
}): Promise<AttemptRecord["localState"]> {
  requireRuntimeCapability(input.session, "read_local_state");
  const attempt = await requireRuntimeAttempt(
    input.repository,
    input.session,
  );

  return attempt.localState;
}

export async function writeAttemptLocalState(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
}): Promise<AttemptRecord> {
  requireRuntimeCapability(input.session, "write_local_state");
  const attempt = await requireRuntimeAttempt(
    input.repository,
    input.session,
  );

  return await input.repository.writeAttemptLocalState({
    attemptId: attempt.attemptId,
    localState: parseAttemptLocalState(input.payload),
  });
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
        summary: "Recorded app progress in the test session.",
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
        summary:
          "Blocked an app progress update outside the allowed test-launch actions.",
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
          summary: "Blocked the test launch from making live LMS changes.",
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
          "Finished the test attempt with simulated scoring and no LMS writes.",
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
        summary: "Blocked the test attempt before any LMS change.",
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

function completionStateToAttemptStatus(
  completionState: FinalizeAttemptInput["completionState"],
): AttemptRecord["status"] {
  return completionState === "completed" ? "completed" : "abandoned";
}
