import type { GatewayCodeSubmissionAcceptedResult } from '../../sdk/app-sdk.ts';
import type { LanternLtiToolContext } from '../lti/tool_provider.ts';
import type { RuntimeSessionRecord } from '../lti/types.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { AttemptRecord, PackageVersionRecord } from '../package_review/types.ts';
import { requireRuntimeAttempt, requireRuntimePackageVersion } from '../runtime/gateway_context.ts';
import { denyRuntimeBroker, errorMessage } from '../runtime/gateway_errors.ts';
import { requireRuntimeCapability } from '../runtime/gateway_parsing.ts';
import type { PythonLabArtifactStore } from './artifact_store.ts';
import { buildPythonSubmissionArtifactKey } from './artifact_store.ts';
import type { PythonLabRepository } from './repository.ts';
import type { CodeSubmissionRunRecord } from './repository.ts';
import { evaluatePythonSubmission } from './service.ts';
import type { PythonGraderSandboxFactory } from './runner.ts';

export interface RuntimeCodeSubmissionResult extends GatewayCodeSubmissionAcceptedResult {
  readonly attempt: AttemptRecord;
}

export async function runRuntimeCodeSubmission(input: {
  readonly repository: PackageReviewRepository;
  readonly pythonLabRepository: PythonLabRepository;
  readonly pythonLabArtifactStore: PythonLabArtifactStore;
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly session: RuntimeSessionRecord;
  readonly payload: unknown;
  readonly getLtiToolContext?: () => Promise<LanternLtiToolContext>;
  readonly createId: () => string;
  readonly now?: () => Date;
}): Promise<RuntimeCodeSubmissionResult> {
  const now = input.now ?? (() => new Date());
  requireRuntimeCapability(input.session, 'run_code_submission');
  const request = parseCodeSubmissionRequest(input.payload);
  const attempt = await requireRuntimeAttempt(input.repository, input.session);
  const packageVersion = await requireRuntimePackageVersion(input.repository, input.session);
  requireSandboxAssignment(packageVersion);
  const definition = await input.pythonLabRepository.getCodeAssignmentDefinitionByPackageVersionId(
    packageVersion.id,
  );

  if (definition === null) {
    throw new Error('Python assignment definition was not found for this package version.');
  }

  const privateArtifact = await input.pythonLabArtifactStore.readPrivateAssignment(
    definition.privateArtifactKey,
  );

  if (privateArtifact.functionName !== definition.functionName) {
    throw new Error('Python assignment definition did not match its private artifact.');
  }

  if (request.phase === 'final') {
    const existing = await input.pythonLabRepository.getFinalCodeSubmissionRunByAttemptId(
      attempt.attemptId,
    );

    if (existing !== null) {
      const run = await requirePersistedFinalRun({
        run: existing,
        pythonLabRepository: input.pythonLabRepository,
        pythonLabArtifactStore: input.pythonLabArtifactStore,
        now,
      });

      return await finalizeTrustedRun({
        repository: input.repository,
        session: input.session,
        attempt,
        packageVersion,
        run,
        ...(input.getLtiToolContext === undefined
          ? {}
          : { getLtiToolContext: input.getLtiToolContext }),
        now,
      });
    }
  }

  const evaluation = await evaluatePythonSubmission({
    source: request.source,
    contract: { functionName: definition.functionName, maxScore: 10 },
    cases: privateArtifact.cases,
    phase: request.phase,
    sandboxFactory: input.sandboxFactory,
    createOneTimeId: input.createId,
  });

  if (evaluation.runnerFailed) {
    throw new Error('Python execution infrastructure did not finish the submission.');
  }

  if (request.phase === 'practice') {
    await input.repository.recordAuditEvent({
      eventType: 'python_submission.practice',
      actorType: 'system',
      actorId: null,
      packageVersionId: input.session.packageVersionId,
      attemptId: attempt.attemptId,
      status: 'accepted',
      summary: 'Ran public Python tests without finalizing the attempt.',
      detail: { publicCaseCount: evaluation.publicOutcomes.length },
      occurredAt: now().toISOString(),
    });

    return {
      accepted: true,
      phase: 'practice',
      publicOutcomes: [...evaluation.publicOutcomes],
      hiddenSummary: null,
      scoreGiven: null,
      scoreMaximum: null,
      alreadyFinalized: false,
      gradePublished: false,
      attempt,
    };
  }

  if (
    evaluation.hiddenSummary === null ||
    evaluation.scoreGiven === null ||
    evaluation.scoreMaximum === null
  ) {
    throw new Error('Final Python evaluation did not produce a trusted score.');
  }

  const runId = `code-run-${input.createId()}`;
  const sourceArtifactKey = buildPythonSubmissionArtifactKey({
    attemptId: attempt.attemptId,
    runId,
  });
  const occurredAt = now().toISOString();
  const reservation = await input.pythonLabRepository.reserveCodeSubmissionRun({
    runId,
    attemptId: attempt.attemptId,
    sourceArtifactKey,
    phase: 'final',
    publicOutcomes: evaluation.publicOutcomes,
    hiddenSummary: evaluation.hiddenSummary,
    scoreGiven: evaluation.scoreGiven,
    scoreMaximum: evaluation.scoreMaximum,
    createdAt: occurredAt,
    sourcePersistedAt: null,
    finalizedAt: occurredAt,
  });

  if (reservation.status === 'existing') {
    const run = await requirePersistedFinalRun({
      run: reservation.run,
      pythonLabRepository: input.pythonLabRepository,
      pythonLabArtifactStore: input.pythonLabArtifactStore,
      now,
    });

    return await finalizeTrustedRun({
      repository: input.repository,
      session: input.session,
      attempt,
      packageVersion,
      run,
      ...(input.getLtiToolContext === undefined
        ? {}
        : { getLtiToolContext: input.getLtiToolContext }),
      now,
    });
  }

  let sourceWritten = false;
  let run: CodeSubmissionRunRecord;

  try {
    await input.pythonLabArtifactStore.writeSubmissionSource(sourceArtifactKey, request.source);
    sourceWritten = true;
    run = await input.pythonLabRepository.markCodeSubmissionSourcePersisted({
      runId,
      sourcePersistedAt: occurredAt,
    });
  } catch (error) {
    if (!sourceWritten) {
      await input.pythonLabRepository.deleteUnpersistedCodeSubmissionRun(runId);
    }
    throw error;
  }

  return await finalizeTrustedRun({
    repository: input.repository,
    session: input.session,
    attempt,
    packageVersion,
    run,
    ...(input.getLtiToolContext === undefined
      ? {}
      : { getLtiToolContext: input.getLtiToolContext }),
    now,
  });
}

async function requirePersistedFinalRun(input: {
  readonly run: CodeSubmissionRunRecord;
  readonly pythonLabRepository: PythonLabRepository;
  readonly pythonLabArtifactStore: PythonLabArtifactStore;
  readonly now: () => Date;
}): Promise<CodeSubmissionRunRecord> {
  if (input.run.sourcePersistedAt !== null) {
    return input.run;
  }

  if (!(await input.pythonLabArtifactStore.submissionSourceExists(input.run.sourceArtifactKey))) {
    throw new Error('A final Python submission is still being recorded. Retry shortly.');
  }

  return await input.pythonLabRepository.markCodeSubmissionSourcePersisted({
    runId: input.run.runId,
    sourcePersistedAt: input.now().toISOString(),
  });
}

async function finalizeTrustedRun(input: {
  readonly repository: PackageReviewRepository;
  readonly session: RuntimeSessionRecord;
  readonly attempt: AttemptRecord;
  readonly packageVersion: PackageVersionRecord;
  readonly run: CodeSubmissionRunRecord;
  readonly getLtiToolContext?: () => Promise<LanternLtiToolContext>;
  readonly now: () => Date;
}): Promise<RuntimeCodeSubmissionResult> {
  const finalizedNow = input.attempt.finalizedAt === null;
  const finalizedAttempt = finalizedNow
    ? await input.repository.finalizeAttempt({
        attemptId: input.attempt.attemptId,
        status: 'completed',
        completionState: 'completed',
        finalizedAt: input.now().toISOString(),
      })
    : input.attempt;

  if (finalizedNow) {
    await input.repository.recordAuditEvent({
      eventType: 'python_submission.finalized',
      actorType: 'system',
      actorId: null,
      packageVersionId: input.session.packageVersionId,
      attemptId: finalizedAttempt.attemptId,
      status: 'accepted',
      summary: 'Finalized a Python submission from a stored server evaluation.',
      detail: {
        runId: input.run.runId,
        scoreGiven: input.run.scoreGiven,
        scoreMaximum: input.run.scoreMaximum,
        hiddenPassed: input.run.hiddenSummary.passed,
        hiddenTotal: input.run.hiddenSummary.total,
      },
      occurredAt: input.now().toISOString(),
    });
  }

  return {
    accepted: true,
    phase: 'final',
    publicOutcomes: [...input.run.publicOutcomes],
    hiddenSummary: input.run.hiddenSummary,
    scoreGiven: input.run.scoreGiven,
    scoreMaximum: input.run.scoreMaximum,
    alreadyFinalized: !finalizedNow,
    gradePublished: false,
    attempt: finalizedAttempt,
  };
}

function parseCodeSubmissionRequest(input: unknown): {
  phase: 'practice' | 'final';
  source: string;
} {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_code_submission_request',
      message: 'Code submission must be an object.',
      capability: 'run_code_submission',
      detail: {},
    });
  }

  const record = input as Record<string, unknown>;

  if (record.phase !== 'practice' && record.phase !== 'final') {
    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_code_submission_phase',
      message: 'Code submission phase must be practice or final.',
      capability: 'run_code_submission',
      detail: {},
    });
  }

  if (
    typeof record.source !== 'string' ||
    record.source.trim() === '' ||
    record.source.length > 32_000
  ) {
    denyRuntimeBroker({
      category: 'specInvalid',
      code: 'invalid_code_submission_source',
      message: 'Python source is required and must contain at most 32000 characters.',
      capability: 'run_code_submission',
      detail: {},
    });
  }

  return { phase: record.phase, source: record.source };
}

function requireSandboxAssignment(packageVersion: PackageVersionRecord): void {
  if (packageVersion.grading.mode !== 'sandbox') {
    denyRuntimeBroker({
      category: 'policyDenied',
      code: 'code_submission_not_configured',
      message: 'This reviewed package does not use Lantern sandbox grading.',
      capability: 'run_code_submission',
      detail: {},
    });
  }
}

export function codeSubmissionFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : errorMessage(error);
}
