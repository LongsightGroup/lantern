import { workflowCheckpoint } from './platform/workflow_checkpoint.ts';
import {
  WorkflowEntrypoint,
  WorkerEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
export { AppWriterAgent } from './app_writer/agent.ts';
export {
  createCloudflarePythonGraderSandboxFactory,
  PythonGraderSandbox,
} from './python_lab/cloudflare_sandbox.ts';
import { createCloudflarePythonGraderSandboxFactory } from './python_lab/cloudflare_sandbox.ts';
import {
  type AppGenerationWorkflowParams,
  runAppGenerationFileWorkflowStep,
  runAppGenerationFinishWorkflowStep,
  runAppGenerationInitializationWorkflowStep,
  runAppGenerationPlanningWorkflowStep,
} from './app_writer/workflow_runner.ts';
import { resolveWorkerServices, type WorkerBindings } from './app_worker_services.ts';
import { createObjectEnvReader } from './platform/env.ts';
import { runPythonLabGenerationWorkflow } from './python_lab/workflow_runner.ts';
import type { PythonLabGenerationWorkflowParams } from './python_lab/workflow.ts';
import type { PrimitiveResult, RosterPage } from '../sdk/worker-app-sdk.ts';
import { createWorkerHandler } from './worker_handler.ts';

interface LanternLmsBindingProps {
  readonly appId: string;
  readonly packageVersionId: number;
}

export default createWorkerHandler(createCloudflarePythonGraderSandboxFactory);

export class AppGenerationWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  AppGenerationWorkflowParams
> {
  declare readonly env: WorkerBindings;

  override async run(
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
      async () =>
        workflowCheckpoint(
          await runAppGenerationInitializationWorkflowStep({
            bindings: this.env,
            params: event.payload,
          }),
        ),
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
      async () =>
        workflowCheckpoint(
          await runAppGenerationPlanningWorkflowStep({
            bindings: this.env,
            initialized: initialized.value,
          }),
        ),
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
      async () =>
        workflowCheckpoint(
          await runAppGenerationFileWorkflowStep({
            bindings: this.env,
            planned: planned.value,
          }),
        ),
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
      async () =>
        workflowCheckpoint(
          await runAppGenerationFinishWorkflowStep({
            bindings: this.env,
            generated: generated.value,
          }),
        ),
    );
  }
}

export class PythonLabGenerationWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  PythonLabGenerationWorkflowParams
> {
  declare readonly env: WorkerBindings;

  override async run(
    event: WorkflowEvent<PythonLabGenerationWorkflowParams>,
    step: WorkflowStep,
  ): Promise<unknown> {
    return await step.do('generate Python autograder Lab', { timeout: '10 minutes' }, async () =>
      workflowCheckpoint(
        await runPythonLabGenerationWorkflow({
          bindings: this.env,
          params: event.payload,
          createPythonSandboxFactory: createCloudflarePythonGraderSandboxFactory,
        }),
      ),
    );
  }
}

export class LanternLmsCapabilityBinding extends WorkerEntrypoint<
  WorkerBindings,
  LanternLmsBindingProps
> {
  declare readonly env: WorkerBindings;
  declare readonly props: LanternLmsBindingProps;

  async listRoster(value: unknown): Promise<PrimitiveResult<RosterPage>> {
    const traceId = crypto.randomUUID();
    if (!isLmsBindingRosterEnvelope(value)) {
      return {
        ok: false,
        error: { code: 'invalid_request', traceId },
      };
    }
    const services = resolveWorkerServices(this.env, createObjectEnvReader(this.env));
    return await services.governedRosterService.listRoster({
      runtimeSessionId: value.runtimeSessionId,
      runtimeSessionToken: value.runtimeSessionToken,
      ...(value.traceId === undefined ? {} : { traceId: value.traceId }),
      request: value.request,
      bindingIdentity: this.props,
    });
  }
}

function isLmsBindingRosterEnvelope(value: unknown): value is {
  readonly runtimeSessionId: string;
  readonly runtimeSessionToken: string;
  readonly traceId?: string;
  readonly request: unknown;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.runtimeSessionId === 'string' &&
    record.runtimeSessionId.length > 0 &&
    typeof record.runtimeSessionToken === 'string' &&
    record.runtimeSessionToken.length > 0 &&
    (record.traceId === undefined ||
      (typeof record.traceId === 'string' && record.traceId.length > 0)) &&
    'request' in record
  );
}
