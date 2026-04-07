import type { ExecutionContext } from '@hono/hono';
import { buildApp } from './app_core.ts';
import { resolveWorkerServices, type WorkerBindings } from './app_worker_services.ts';
import { createObjectEnvReader } from './platform/env.ts';

interface WorkerExecutionContext {
  waitUntil?(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

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
