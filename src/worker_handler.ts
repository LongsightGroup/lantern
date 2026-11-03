import type { ExecutionContext } from 'hono';
import { buildApp } from './app_core.ts';
import {
  type PythonGraderSandboxFactoryProvider,
  resolveWorkerServices,
  type WorkerBindings,
} from './app_worker_services.ts';
import { createObjectEnvReader } from './platform/env.ts';
import { purgeExpiredPythonLabs } from './python_lab/retention.ts';

interface WorkerExecutionContext {
  waitUntil?(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
  readonly exports?: {
    LanternLmsCapabilityBinding(input: {
      readonly props: { readonly appId: string; readonly packageVersionId: number };
    }): unknown;
  };
}

interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
}

export function createWorkerHandler(
  createPythonSandboxFactory?: PythonGraderSandboxFactoryProvider,
) {
  return {
    fetch(
      request: Request,
      env: WorkerBindings = {},
      executionContext?: WorkerExecutionContext,
    ): Response | Promise<Response> {
      const app = buildApp(
        resolveWorkerServices(
          env,
          createObjectEnvReader(env),
          executionContext?.exports === undefined
            ? undefined
            : (identity) =>
                executionContext.exports!.LanternLmsCapabilityBinding({ props: identity }),
          createPythonSandboxFactory,
        ),
        { kernelAdminContext: true },
      );

      return app.fetch(request, env, toHonoExecutionContext(executionContext));
    },

    scheduled(
      _controller: ScheduledController,
      env: WorkerBindings = {},
      executionContext?: WorkerExecutionContext,
    ): void | Promise<void> {
      const services = resolveWorkerServices(env, createObjectEnvReader(env));
      const cleanup = purgeExpiredPythonLabs({
        repository: services.getRepository(),
        pythonLabRepository: services.pythonLabRepository,
        pythonLabArtifactStore: services.pythonLabArtifactStore,
      });

      if (executionContext?.waitUntil !== undefined) {
        executionContext.waitUntil(cleanup);
        return;
      }

      return cleanup.then(() => undefined);
    },
  };
}

function toHonoExecutionContext(
  executionContext?: WorkerExecutionContext,
): ExecutionContext | undefined {
  if (executionContext === undefined) return undefined;
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
