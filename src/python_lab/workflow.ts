export interface PythonLabGenerationWorkflowBinding {
  create(input: {
    readonly id: string;
    readonly params: PythonLabGenerationWorkflowParams;
  }): Promise<{ readonly id?: string }>;
}

export interface PythonLabGenerationWorkflowParams {
  readonly labId: string;
}

export interface PythonLabGenerationScheduler {
  schedule(
    input: PythonLabGenerationWorkflowParams,
  ): Promise<{ readonly workflowInstanceId: string | null }>;
}

export function createCloudflarePythonLabGenerationScheduler(
  workflow: PythonLabGenerationWorkflowBinding,
): PythonLabGenerationScheduler {
  return {
    async schedule(input) {
      const instance = await workflow.create({ id: input.labId, params: input });
      return { workflowInstanceId: typeof instance.id === 'string' ? instance.id : null };
    },
  };
}

export function createUnavailablePythonLabGenerationScheduler(
  message: string,
): PythonLabGenerationScheduler {
  return {
    schedule() {
      return Promise.reject(new Error(message));
    },
  };
}

export function isPythonLabGenerationWorkflowBinding(
  value: unknown,
): value is PythonLabGenerationWorkflowBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<PythonLabGenerationWorkflowBinding>).create === 'function'
  );
}
