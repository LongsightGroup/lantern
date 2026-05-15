import type { ExecutionContext } from '@hono/hono';
import { buildApp } from './app_core.ts';
import {
  type AppGenerationWorkflowParams,
  runAppGenerationWorkflow,
} from './app_writer/workflow_runner.ts';
import { resolveWorkerServices, type WorkerBindings } from './app_worker_services.ts';
import { createObjectEnvReader } from './platform/env.ts';

interface WorkflowEntrypointRuntimeClass {
  new (): object;
}

declare const WorkflowEntrypoint: WorkflowEntrypointRuntimeClass | undefined;

interface WorkflowEvent<Params> {
  readonly payload: Readonly<Params>;
  readonly timestamp: Date;
  readonly instanceId: string;
}

interface WorkflowStep {
  do<Result>(name: string, callback: () => Result | Promise<Result>): Promise<Result>;
  do<Result>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Result | Promise<Result>,
  ): Promise<Result>;
}

interface WorkflowStepConfig {
  retries?: {
    limit: number;
    delay: string | number;
    backoff?: 'constant' | 'linear' | 'exponential';
  };
  timeout?: string | number;
}

interface WorkerExecutionContext {
  waitUntil?(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

const WorkflowEntrypointBase: WorkflowEntrypointRuntimeClass =
  typeof WorkflowEntrypoint === 'function' ? WorkflowEntrypoint : Object;

export default {
  fetch(
    request: Request,
    env: WorkerBindings = {},
    executionContext?: WorkerExecutionContext,
  ): Response | Promise<Response> {
    const app = buildApp(resolveWorkerServices(env, createObjectEnvReader(env)));

    return app.fetch(request, env, toHonoExecutionContext(executionContext));
  },
};

export class AppGenerationWorkflow extends WorkflowEntrypointBase {
  declare readonly env: WorkerBindings;

  async run(
    event: WorkflowEvent<AppGenerationWorkflowParams>,
    step: WorkflowStep,
  ): Promise<unknown> {
    return await step.do(
      'continue app writer generation',
      {
        retries: {
          limit: 1,
          delay: '30 seconds',
          backoff: 'exponential',
        },
        timeout: '15 minutes',
      },
      () =>
        runAppGenerationWorkflow({
          bindings: this.env,
          params: event.payload,
        }),
    );
  }
}

function toHonoExecutionContext(
  executionContext?: WorkerExecutionContext,
): ExecutionContext | undefined {
  if (executionContext === undefined) {
    return undefined;
  }

  return {
    props: {},
    waitUntil(promise) {
      executionContext.waitUntil?.(promise);
    },
    passThroughOnException() {
      executionContext.passThroughOnException?.();
    },
  };
}
