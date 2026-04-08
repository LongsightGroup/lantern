import {
  type AttemptScoreResult,
  loadReviewedRubric,
  scoreAttempt,
} from "../grading/service.ts";
import type { BrowserGraderResult } from "../../sdk/app-sdk.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";
import type { EnvReader } from "../platform/env.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  AttemptRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import type { RuntimeArtifactStore } from "./artifact_store.ts";
import {
  previewSessionHasLiveServicePath,
  requireRuntimeAttempt,
  requireRuntimePackageVersion,
  resolvePreviewSession,
} from "./gateway_context.ts";
import {
  denyRuntimeBroker,
  errorMessage,
  toFinalizeError,
} from "./gateway_errors.ts";
import {
  parseAttemptEvent,
  parseAttemptLocalState,
  parseFinalizeAttemptInput,
  parseScoreProposal,
  requireRuntimeCapability,
} from "./gateway_parsing.ts";
import { publishRuntimeAttemptScore } from "./gateway_publication.ts";
import { readReviewedBrowserGraderConfig } from "./browser_grader.ts";
import type {
  FinalizeAttemptInput,
  FinalizeAttemptResult,
  RuntimeScoreProposalResult,
} from "./gateway_types.ts";
export type {
  FinalizeAttemptInput,
  FinalizeAttemptResult,
  GovernedGradePublicationInput,
  GovernedGradePublicationResult,
  RuntimeBoundary,
  RuntimeBrokerDenial,
  RuntimeBrokerDenialCategory,
  RuntimeBrokerDeniedResult,
  RuntimeBrokerMutationResult,
  RuntimeOutcome,
  RuntimeSandboxModel,
  RuntimeScoreProposal,
  RuntimeScoreProposalResult,
} from "./gateway_types.ts";
export {
  parseAttemptEvent,
  parseAttemptLocalState,
  parseBrowserGraderResult,
  parseFinalizeAttemptInput,
  parseScoreProposal,
  requireRuntimeCapability,
} from "./gateway_parsing.ts";
export { publishGovernedGradePublication } from "./gateway_publication.ts";

export async function readAttemptLocalState(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
}): Promise<AttemptRecord["localState"]> {
  requireRuntimeCapability(input.session, "read_local_state");
  const attempt = await requireRuntimeAttempt(input.repository, input.session);

  return attempt.localState;
}

export async function writeAttemptLocalState(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
}): Promise<AttemptRecord> {
  requireRuntimeCapability(input.session, "write_local_state");
  const attempt = await requireRuntimeAttempt(input.repository, input.session);

  return await input.repository.writeAttemptLocalState({
    attemptId: attempt.attemptId,
    localState: parseAttemptLocalState(input.payload),
  });
}

export async function submitScoreProposal(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
  now?: () => Date;
}): Promise<RuntimeScoreProposalResult> {
  requireRuntimeCapability(input.session, "finalize_attempt");
  await requireRuntimeAttempt(input.repository, input.session);

  return {
    accepted: true,
    scoreProposal: parseScoreProposal(input.payload),
  };
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
  env: EnvReader;
  artifactStore: RuntimeArtifactStore;
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
    const packageVersion = await requireRuntimePackageVersion(
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
        denyRuntimeBroker({
          category: "policyDenied",
          code: "preview_live_side_effects_blocked",
          message: "Preview mode blocks live LMS side effects.",
          capability: "finalize_attempt",
          detail: {
            hasAgsServices: input.session.services.ags !== null,
            hasNrpsServices: input.session.services.nrps !== null,
          },
        });
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
      const browserGraderResult = packageVersion.grading.mode === "browser"
        ? validateBrowserGraderResult({
          browserGraderResult: finalizeInput.browserGraderResult,
          packageVersion,
        })
        : null;
      const score: AttemptScoreResult = browserGraderResult === null
        ? {
          scoreGiven: 0,
          scoreMaximum: previewSession.fakeScoreMaximum,
        }
        : {
          scoreGiven: browserGraderResult.scoreGiven,
          scoreMaximum: browserGraderResult.scoreMaximum,
        };

      await input.repository.appendPreviewEvidence({
        previewSessionId: previewSession.sessionId,
        eventType: "preview.finalize",
        capability: "finalize_attempt",
        summary: browserGraderResult === null
          ? "Finished the test attempt with simulated scoring and no LMS writes."
          : "Finished the test attempt with browser grader output and no LMS writes.",
        detail: browserGraderResult === null
          ? {
            attemptId: finalizedAttempt.attemptId,
            completionState: finalizedAttempt.completionState,
            scoreGiven: score.scoreGiven,
            scoreMaximum: score.scoreMaximum,
            alreadyFinalized: !finalizedNow,
          }
          : {
            attemptId: finalizedAttempt.attemptId,
            completionState: finalizedAttempt.completionState,
            scoreGiven: score.scoreGiven,
            scoreMaximum: score.scoreMaximum,
            alreadyFinalized: !finalizedNow,
            browserGraderResult,
          },
        occurredAt,
      });

      return {
        attempt: finalizedAttempt,
        score,
        browserGraderResult,
        finalizedNow,
        lineItemBinding: null,
        gradePublication: null,
        gradePublishedNow: false,
        publishError: null,
      };
    }

    if (packageVersion.grading.mode === "manual") {
      denyRuntimeBroker({
        category: "policyDenied",
        code: "manual_grading_requires_operator",
        message: "Manual grading cannot be finalized automatically in Phase 3.",
        capability: "finalize_attempt",
        detail: {},
      });
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
        artifactStore: input.artifactStore,
      })
      : undefined;
    const browserGraderResult = packageVersion.grading.mode === "browser"
      ? validateBrowserGraderResult({
        browserGraderResult: finalizeInput.browserGraderResult,
        packageVersion,
      })
      : null;
    const score = browserGraderResult === null
      ? scoreAttempt({
        attempt: finalizedAttempt,
        events,
        grading: packageVersion.grading,
        ...(rubric === undefined ? {} : { rubric }),
      })
      : {
        scoreGiven: browserGraderResult.scoreGiven,
        scoreMaximum: browserGraderResult.scoreMaximum,
      };
    const publishResult = await publishRuntimeAttemptScore({
      repository: input.repository,
      session: input.session,
      attempt: finalizedAttempt,
      packageVersion,
      score,
      env: input.env,
      now,
    });

    return {
      attempt: finalizedAttempt,
      score,
      browserGraderResult,
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

function validateBrowserGraderResult(input: {
  browserGraderResult: BrowserGraderResult | null;
  packageVersion: Pick<PackageVersionRecord, "grading" | "manifestJson">;
}): BrowserGraderResult {
  const reviewedConfig = readReviewedBrowserGraderConfig(input.packageVersion);

  if (reviewedConfig === null) {
    throw new Error(
      "Reviewed browser grading configuration was missing from the approved package.",
    );
  }

  if (input.browserGraderResult === null) {
    denyRuntimeBroker({
      category: "specInvalid",
      code: "browser_grader_result_missing",
      message:
        "Browser grading requires browserGraderResult in finalizeAttempt().",
      capability: "finalize_attempt",
      detail: {},
    });
  }

  if (input.browserGraderResult.scoreMaximum !== reviewedConfig.scoreMaximum) {
    denyRuntimeBroker({
      category: "specInvalid",
      code: "browser_grader_score_maximum_mismatch",
      message:
        "Browser grader scoreMaximum must match the reviewed grading max score.",
      capability: "finalize_attempt",
      detail: {
        scoreMaximum: input.browserGraderResult.scoreMaximum,
        reviewedScoreMaximum: reviewedConfig.scoreMaximum,
      },
    });
  }

  const reviewedSources = new Set(reviewedConfig.reviewedSpecFiles);
  const seenSources = new Set<string>();

  for (const specResult of input.browserGraderResult.specResults) {
    if (!reviewedSources.has(specResult.source)) {
      denyRuntimeBroker({
        category: "specInvalid",
        code: "browser_grader_spec_source_invalid",
        message:
          "Browser grader specResults must stay inside reviewed grader spec files.",
        capability: "finalize_attempt",
        detail: {
          source: specResult.source,
        },
      });
    }

    if (seenSources.has(specResult.source)) {
      denyRuntimeBroker({
        category: "specInvalid",
        code: "browser_grader_spec_source_duplicate",
        message:
          "Browser grader specResults cannot repeat the same reviewed spec file.",
        capability: "finalize_attempt",
        detail: {
          source: specResult.source,
        },
      });
    }

    seenSources.add(specResult.source);
  }

  return input.browserGraderResult;
}

function completionStateToAttemptStatus(
  completionState: FinalizeAttemptInput["completionState"],
): AttemptRecord["status"] {
  return completionState === "completed" ? "completed" : "abandoned";
}
