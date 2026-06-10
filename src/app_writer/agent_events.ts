import { selectCurrentGenerationPlanStep } from './generation_plan.ts';
import { summarizeGenerationActivityEvents } from './service_activity.ts';
import type { AppWriterAgentSessionSnapshot } from './agent_session.ts';
import type {
  AppWriterAgentEnv,
  DurableObjectState,
  StoredAppWriterAgentSession,
} from './agent_types.ts';
import { isD1Database } from '../db/d1.ts';
import { createD1PackageReviewRepository } from '../package_review/repository_package_versions_d1.ts';

export const AGENT_SESSION_STORAGE_KEY = 'appWriterAgentSession';

const SSE_RETRY_MS = 2000;
const SSE_POLL_INTERVAL_MS = 2000;
const SSE_MAX_POLLS = 30;

export function streamAgentEvents(input: {
  loadSnapshot: () => Promise<AppWriterAgentSessionSnapshot>;
}): Response {
  const encoder = new TextEncoder();
  let lastPayload = '';

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      controller.enqueue(encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`));

      for (let poll = 0; poll < SSE_MAX_POLLS; poll += 1) {
        const snapshot = await input.loadSnapshot();
        const payload = JSON.stringify(snapshot);

        if (payload !== lastPayload) {
          controller.enqueue(encoder.encode(`event: snapshot\ndata: ${payload}\n\n`));
          lastPayload = payload;
        }

        if (
          snapshot.status === 'unknown' ||
          snapshot.status === 'failed' ||
          snapshot.status === 'saved_pending_version'
        ) {
          break;
        }

        await sleep(SSE_POLL_INTERVAL_MS);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=UTF-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}

export async function loadAgentSnapshot(input: {
  state: DurableObjectState;
  env: AppWriterAgentEnv;
}): Promise<AppWriterAgentSessionSnapshot> {
  const session = await input.state.storage.get<StoredAppWriterAgentSession>(
    AGENT_SESSION_STORAGE_KEY,
  );
  const generationId = session?.generationId ?? 'unknown';
  const baseSnapshot = buildUnknownSnapshot(session);

  if (!isD1Database(input.env.DB) || session === undefined) {
    return baseSnapshot;
  }

  const repository = createD1PackageReviewRepository(input.env.DB);
  const run = await repository.getAppGenerationRunById(generationId);

  if (run === null) {
    return baseSnapshot;
  }

  const workspace = await repository.getAppGenerationWorkspaceByGenerationId(generationId);
  const currentStep = workspace === null
    ? null
    : selectCurrentGenerationPlanStep(workspace.generationPlan);
  const activitySummary = await summarizeGenerationActivityEvents(repository, generationId);
  const latestModelRequest = [...run.modelRequestMetadata]
    .reverse()
    .find((metadata) => metadata.stage === 'author' || metadata.stage === 'repair');

  return {
    generationId,
    status: run.status,
    currentPlanStepId: currentStep?.id ?? null,
    currentPlanStepStatus: currentStep?.status ?? null,
    currentPlanStepSummary: currentStep?.summary ?? null,
    lastActivitySummary: activitySummary.lastSummary,
    currentModelStage: session.currentModelStage ??
      (latestModelRequest?.stage === 'author' || latestModelRequest?.stage === 'repair'
        ? latestModelRequest.stage
        : null),
    currentModelAttempt: session.currentModelAttempt ?? latestModelRequest?.attempt ?? null,
    workflowInstanceId: session.workflowInstanceId,
    packageVersionId: run.packageVersionId,
    repairAttemptCount: run.repairAttemptCount,
    validationFindingCount: run.validationFindings.length,
    activityEventCount: activitySummary.count,
    updatedAt: run.updatedAt,
  };
}

function buildUnknownSnapshot(
  session: StoredAppWriterAgentSession | undefined,
): AppWriterAgentSessionSnapshot {
  return {
    generationId: session?.generationId ?? 'unknown',
    status: 'unknown',
    currentPlanStepId: null,
    currentPlanStepStatus: null,
    currentPlanStepSummary: null,
    lastActivitySummary: null,
    currentModelStage: session?.currentModelStage ?? null,
    currentModelAttempt: session?.currentModelAttempt ?? null,
    workflowInstanceId: session?.workflowInstanceId ?? null,
    packageVersionId: null,
    repairAttemptCount: 0,
    validationFindingCount: 0,
    activityEventCount: 0,
    updatedAt: session?.observedAt ?? null,
  };
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
