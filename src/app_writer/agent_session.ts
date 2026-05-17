import type {
  AppGenerationModelRequestStage,
  AppGenerationPlanStepId,
  AppGenerationStatus,
} from './types.ts';

export interface AppWriterAgentSessionCoordinator {
  observe(input: AppWriterAgentObserveInput): Promise<void>;
  fetchState(generationId: string): Promise<AppWriterAgentSessionSnapshot>;
  fetchEvents(generationId: string, request: Request): Promise<Response>;
}

export interface AppWriterAgentObserveInput {
  generationId: string;
  ownerId: string;
  workflowInstanceId: string | null;
  observedAt: string;
}

export interface AppWriterAgentSessionSnapshot {
  generationId: string;
  status: AppGenerationStatus | 'unknown';
  currentPlanStepId: AppGenerationPlanStepId | null;
  currentPlanStepStatus: string | null;
  currentPlanStepSummary: string | null;
  lastActivitySummary: string | null;
  currentModelStage: AppGenerationModelRequestStage | null;
  currentModelAttempt: number | null;
  workflowInstanceId: string | null;
  packageVersionId: number | null;
  repairAttemptCount: number;
  validationFindingCount: number;
  activityEventCount: number;
  updatedAt: string | null;
}

export interface AppWriterAgentNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): AppWriterAgentStub;
}

export interface AppWriterAgentStub {
  fetch(request: Request): Promise<Response>;
}

export function createNoopAppWriterAgentSessionCoordinator(): AppWriterAgentSessionCoordinator {
  return {
    observe(_input) {
      return Promise.resolve();
    },
    fetchState(generationId) {
      return Promise.resolve({
        generationId,
        status: 'unknown',
        currentPlanStepId: null,
        currentPlanStepStatus: null,
        currentPlanStepSummary: null,
        lastActivitySummary: null,
        currentModelStage: null,
        currentModelAttempt: null,
        workflowInstanceId: null,
        packageVersionId: null,
        repairAttemptCount: 0,
        validationFindingCount: 0,
        activityEventCount: 0,
        updatedAt: null,
      });
    },
    fetchEvents(_generationId, _request) {
      return Promise.resolve(
        Response.json(
          {
            error: {
              code: 'app_writer_agent_unavailable',
              message: 'App writer Agent sessions are not configured.',
            },
          },
          { status: 503 },
        ),
      );
    },
  };
}

export function createUnavailableAppWriterAgentSessionCoordinator(
  message: string,
): AppWriterAgentSessionCoordinator {
  return {
    observe(_input) {
      return Promise.reject(new Error(message));
    },
    fetchState(_generationId) {
      return Promise.reject(new Error(message));
    },
    fetchEvents(_generationId, _request) {
      return Promise.resolve(
        Response.json(
          {
            error: {
              code: 'app_writer_agent_unavailable',
              message,
            },
          },
          { status: 503 },
        ),
      );
    },
  };
}

export function createCloudflareAppWriterAgentSessionCoordinator(
  namespace: AppWriterAgentNamespace,
): AppWriterAgentSessionCoordinator {
  return {
    async observe(input) {
      const response = await getAgentStub(namespace, input.generationId).fetch(
        new Request('https://app-writer-agent.internal/observe', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(input),
        }),
      );

      if (!response.ok) {
        throw new Error(
          `App writer Agent observe failed with HTTP ${response.status}: ${await response.text()}`,
        );
      }
    },
    async fetchState(generationId) {
      const response = await getAgentStub(namespace, generationId).fetch(
        new Request('https://app-writer-agent.internal/state'),
      );

      if (!response.ok) {
        throw new Error(
          `App writer Agent state failed with HTTP ${response.status}: ${await response.text()}`,
        );
      }

      return (await response.json()) as AppWriterAgentSessionSnapshot;
    },
    fetchEvents(generationId, request) {
      const forwarded = new Request('https://app-writer-agent.internal/events', {
        method: request.method,
        headers: request.headers,
      });

      return getAgentStub(namespace, generationId).fetch(forwarded);
    },
  };
}

export function isAppWriterAgentNamespace(value: unknown): value is AppWriterAgentNamespace {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AppWriterAgentNamespace>).idFromName === 'function' &&
    typeof (value as Partial<AppWriterAgentNamespace>).get === 'function'
  );
}

function getAgentStub(
  namespace: AppWriterAgentNamespace,
  generationId: string,
): AppWriterAgentStub {
  return namespace.get(namespace.idFromName(generationId));
}
