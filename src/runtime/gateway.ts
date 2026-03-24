import type { AttemptEvent, Capability } from "../../sdk/app-sdk.ts";
import {
  type AttemptScoreResult,
  loadReviewedRubric,
  scoreAttempt,
} from "../grading/service.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";
import type { PackageReviewRepository } from "../package_review/repository.ts";
import type {
  AttemptRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";

export interface FinalizeAttemptInput {
  completionState: "completed" | "abandoned";
}

export interface FinalizeAttemptResult {
  attempt: AttemptRecord;
  score: AttemptScoreResult;
  finalizedNow: boolean;
}

export async function acceptAttemptEvent(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
  now?: () => Date;
}) {
  requireRuntimeCapability(input.session, "submit_attempt_event");
  const event = parseAttemptEvent(input.payload);
  const now = input.now ?? (() => new Date());

  return await input.repository.appendAttemptEvent({
    attemptId: input.session.attemptId,
    event,
    receivedAt: now().toISOString(),
  });
}

export async function finalizeRuntimeAttempt(input: {
  repository: PackageReviewRepository;
  session: RuntimeSessionRecord;
  payload: unknown;
  now?: () => Date;
}): Promise<FinalizeAttemptResult> {
  requireRuntimeCapability(input.session, "finalize_attempt");
  const finalizeInput = parseFinalizeAttemptInput(input.payload);
  const now = input.now ?? (() => new Date());

  try {
    const attempt = await requireRuntimeAttempt(
      input.repository,
      input.session,
    );
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

    return {
      attempt: finalizedAttempt,
      score,
      finalizedNow,
    };
  } catch (error) {
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

function toFinalizeError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Finalize ")) {
    return error;
  }

  return new Error(`Finalize blocked: ${errorMessage(error)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown finalize error.";
}
