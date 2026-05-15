import { APP_GENERATION_AUDIT_EVENT_TYPES } from './service.ts';
import type {
  AppGenerationPlanStep,
  AppGenerationPlanStepId,
  AppGenerationPlanStepStatus,
} from './types.ts';
import type { AppWriterAgentObserveInput, AppWriterAgentSessionSnapshot } from './agent_session.ts';
import { isD1Database, type D1Database } from '../db/d1.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import { createD1PackageReviewRepository } from '../package_review/repository_package_versions_d1.ts';

const AGENT_SESSION_STORAGE_KEY = 'appWriterAgentSession';
const SSE_RETRY_MS = 2000;
const SSE_POLL_INTERVAL_MS = 2000;
const SSE_MAX_POLLS = 30;

interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

interface AppWriterAgentEnv extends Record<string, unknown> {
  DB?: D1Database;
}

interface StoredAppWriterAgentSession {
  generationId: string;
  ownerId: string;
  workflowInstanceId: string | null;
  observedAt: string;
}

export class AppWriterAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AppWriterAgentEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/observe')) {
      if (request.method !== 'POST') {
        return jsonError(405, 'method_not_allowed', 'App writer Agent observe requires POST.');
      }

      const input = await readObserveInput(request);
      await this.state.storage.put(AGENT_SESSION_STORAGE_KEY, input);

      return Response.json({ ok: true });
    }

    if (url.pathname.endsWith('/state')) {
      if (request.method !== 'GET') {
        return jsonError(405, 'method_not_allowed', 'App writer Agent state requires GET.');
      }

      return Response.json(await this.loadSnapshot());
    }

    if (url.pathname.endsWith('/events')) {
      if (request.method !== 'GET') {
        return jsonError(405, 'method_not_allowed', 'App writer Agent events require GET.');
      }

      return this.streamEvents();
    }

    return jsonError(404, 'not_found', 'App writer Agent endpoint was not found.');
  }

  private streamEvents(): Response {
    const encoder = new TextEncoder();
    let lastPayload = '';

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        controller.enqueue(encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`));

        for (let poll = 0; poll < SSE_MAX_POLLS; poll += 1) {
          const snapshot = await this.loadSnapshot();
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

  private async loadSnapshot(): Promise<AppWriterAgentSessionSnapshot> {
    const session =
      await this.state.storage.get<StoredAppWriterAgentSession>(AGENT_SESSION_STORAGE_KEY);
    const generationId = session?.generationId ?? 'unknown';
    const baseSnapshot = buildUnknownSnapshot(session);

    if (!isD1Database(this.env.DB) || session === undefined) {
      return baseSnapshot;
    }

    const repository = createD1PackageReviewRepository(this.env.DB);
    const run = await repository.getAppGenerationRunById(generationId);

    if (run === null) {
      return baseSnapshot;
    }

    const workspace = await repository.getAppGenerationWorkspaceByGenerationId(generationId);
    const currentStep = workspace === null ? null : selectCurrentPlanStep(workspace.generationPlan);

    return {
      generationId,
      status: run.status,
      currentPlanStepId: currentStep?.id ?? null,
      currentPlanStepStatus: currentStep?.status ?? null,
      workflowInstanceId: session.workflowInstanceId,
      packageVersionId: run.packageVersionId,
      repairAttemptCount: run.repairAttemptCount,
      validationFindingCount: run.validationFindings.length,
      activityEventCount: await countGenerationActivityEvents(repository, generationId),
      updatedAt: run.updatedAt,
    };
  }
}

async function readObserveInput(request: Request): Promise<AppWriterAgentObserveInput> {
  const value = await request.json();

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('App writer Agent observe input must be a JSON object.');
  }

  const record = value as Record<string, unknown>;

  return {
    generationId: expectString(record.generationId, 'generationId'),
    ownerId: expectString(record.ownerId, 'ownerId'),
    workflowInstanceId: expectNullableString(record.workflowInstanceId, 'workflowInstanceId'),
    observedAt: expectString(record.observedAt, 'observedAt'),
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
    workflowInstanceId: session?.workflowInstanceId ?? null,
    packageVersionId: null,
    repairAttemptCount: 0,
    validationFindingCount: 0,
    activityEventCount: 0,
    updatedAt: session?.observedAt ?? null,
  };
}

function selectCurrentPlanStep(
  plan: readonly AppGenerationPlanStep[],
): { id: AppGenerationPlanStepId; status: AppGenerationPlanStepStatus } | null {
  const running = plan.find((step) => step.status === 'running');

  if (running !== undefined) {
    return {
      id: running.id,
      status: running.status,
    };
  }

  const failed = plan.find((step) => step.status === 'failed');

  if (failed !== undefined) {
    return {
      id: failed.id,
      status: failed.status,
    };
  }

  const active = [...plan].reverse().find((step) => step.status !== 'pending');

  return active === undefined ? null : { id: active.id, status: active.status };
}

async function countGenerationActivityEvents(
  repository: Pick<PackageReviewRepository, 'listAuditEventsByEventType'>,
  generationId: string,
): Promise<number> {
  const eventBatches = await Promise.all(
    APP_GENERATION_AUDIT_EVENT_TYPES.map((eventType) =>
      repository.listAuditEventsByEventType(eventType),
    ),
  );

  return eventBatches.flat().filter((event) => event.detail.generationId === generationId).length;
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be text.`);
  }

  return value;
}

function expectNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, fieldName);
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
