import type { ExecutionContext } from '@hono/hono';
import { buildApp } from './app_core.ts';
export { AppWriterAgent } from './app_writer/agent.ts';
import {
  type AppGenerationWorkflowParams,
  runAppGenerationFileWorkflowStep,
  runAppGenerationFinishWorkflowStep,
  runAppGenerationInitializationWorkflowStep,
  runAppGenerationPlanningWorkflowStep,
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
    const initialized = await step.do(
      'initialize app writer workspace',
      {
        retries: {
          limit: 1,
          delay: '30 seconds',
          backoff: 'exponential',
        },
        timeout: '2 minutes',
      },
      () =>
        runAppGenerationInitializationWorkflowStep({
          bindings: this.env,
          params: event.payload,
        }),
    );

    if (!initialized.ok) {
      return initialized.result;
    }

    const planned = await step.do(
      'plan app writer generation',
      {
        retries: {
          limit: 1,
          delay: '30 seconds',
          backoff: 'exponential',
        },
        timeout: '5 minutes',
      },
      () =>
        runAppGenerationPlanningWorkflowStep({
          bindings: this.env,
          initialized: initialized.value,
        }),
    );

    if (!planned.ok) {
      return planned.result;
    }

    const generated = await step.do(
      'write app writer scaffold files',
      {
        retries: {
          limit: 1,
          delay: '30 seconds',
          backoff: 'exponential',
        },
        timeout: '45 minutes',
      },
      () =>
        runAppGenerationFileWorkflowStep({
          bindings: this.env,
          planned: planned.value,
        }),
    );

    if (!generated.ok) {
      return generated.result;
    }

    return await step.do(
      'validate repair and save app writer package',
      {
        retries: {
          limit: 1,
          delay: '30 seconds',
          backoff: 'exponential',
        },
        timeout: '15 minutes',
      },
      () =>
        runAppGenerationFinishWorkflowStep({
          bindings: this.env,
          generated: generated.value,
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
