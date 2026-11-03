import {
  type PythonGraderSandboxFactoryProvider,
  resolveWorkerServices,
  type WorkerBindings,
} from '../app_worker_services.ts';
import { createObjectEnvReader } from '../platform/env.ts';
import { generatePythonLab } from './lab_service.ts';
import type { PythonLabGenerationWorkflowParams } from './workflow.ts';

export async function runPythonLabGenerationWorkflow(input: {
  readonly bindings: WorkerBindings;
  readonly params: PythonLabGenerationWorkflowParams;
  readonly createPythonSandboxFactory?: PythonGraderSandboxFactoryProvider;
}): Promise<{ readonly labId: string; readonly state: string }> {
  const services = resolveWorkerServices(
    input.bindings,
    createObjectEnvReader(input.bindings),
    undefined,
    input.createPythonSandboxFactory,
  );
  const lab = await services.pythonLabRepository.getLabById(input.params.labId);

  if (lab === null) {
    throw new Error('Python Lab generation target was not found.');
  }

  const completed = await generatePythonLab({
    lab,
    repository: services.getRepository(),
    pythonLabRepository: services.pythonLabRepository,
    pythonLabArtifactStore: services.pythonLabArtifactStore,
    sandboxFactory: services.pythonGraderSandboxFactory,
    testVectorGenerator: services.pythonTestVectorGenerator,
    importPackageFromSource: services.importPackageFromSource,
    createId: () => crypto.randomUUID().replaceAll('-', ''),
  });

  return { labId: completed.labId, state: completed.state };
}
