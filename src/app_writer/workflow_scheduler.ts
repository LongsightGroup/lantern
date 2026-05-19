export interface AppGenerationWorkflowBinding {
  create(input: AppGenerationWorkflowCreateInput): Promise<AppGenerationWorkflowInstance>;
}

export interface AppGenerationWorkflowCreateInput {
  id: string;
  params: AppGenerationWorkflowParams;
}

export interface AppGenerationWorkflowParams {
  generationId: string;
}

export interface AppGenerationWorkflowInstance {
  id?: string;
}

export type AppGenerationScheduleResult =
  | {
    mode: 'workflow';
    workflowInstanceId: string | null;
  }
  | {
    mode: 'not_configured';
  };

export interface AppGenerationRunScheduler {
  schedule(input: AppGenerationWorkflowParams): Promise<AppGenerationScheduleResult>;
}

export function createUnavailableAppGenerationRunScheduler(): AppGenerationRunScheduler {
  return {
    schedule(_input) {
      return Promise.resolve({ mode: 'not_configured' });
    },
  };
}

export function createCloudflareWorkflowAppGenerationRunScheduler(
  workflow: AppGenerationWorkflowBinding,
): AppGenerationRunScheduler {
  return {
    async schedule(input) {
      const instance = await workflow.create({
        id: input.generationId,
        params: {
          generationId: input.generationId,
        },
      });

      return {
        mode: 'workflow',
        workflowInstanceId: typeof instance.id === 'string' ? instance.id : null,
      };
    },
  };
}

export function isAppGenerationWorkflowBinding(
  value: unknown,
): value is AppGenerationWorkflowBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<AppGenerationWorkflowBinding>).create === 'function'
  );
}
