import { bindings, defineConfig, defineContainer, exports, triggers } from 'cf/config';
import { appWriterPlatform } from './cloudflare.platform.ts';

const pythonGrader = defineContainer({
  name: 'lantern-python-grader-v1',
  schedulingPolicy: 'durable-object',
  images: { sandbox: { dockerfile: './Dockerfile.python-grader' } },
});

export default defineConfig({
  worker: {
    name: 'lantern',
    compatibilityDate: '2026-11-02',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: './src/worker.ts',
    placement: {
      mode: 'smart',
    },
    domains: ['lantern.appboundary.com'],
    triggers: [
      triggers.scheduled({
        schedule: '17 3 * * *',
      }),
    ],
    env: {
      BETTER_AUTH_SECRET: bindings.secret(),
      LTI_STATE_SECRET: bindings.secret(),
      LTI_TOOL_PRIVATE_JWK: bindings.secret(),
      APP_ADMIN_TIME_ZONE: bindings.text('America/New_York'),
      APP_ORIGIN: bindings.text('https://lantern.appboundary.com'),
      APP_RUNTIME_ORIGIN: bindings.text('https://lantern.appboundary.com'),
      ADMIN_AUTH_ALLOW_SIGNUP: bindings.text('1'),
      APP_WRITER_MODEL: bindings.text('@cf/moonshotai/kimi-k2.6'),
      DB: bindings.d1({
        name: 'lantern',
        id: '0f0a956c-c1f8-43dd-bcdb-80577be94856',
      }),
      PACKAGE_ARTIFACTS: bindings.r2({
        name: 'lantern-prod-artifacts',
      }),
      APP_WRITER_SOURCE_COMPILER: bindings.worker({
        worker: appWriterPlatform,
      }),
      APP_WRITER_PREVIEWER: bindings.worker({
        worker: appWriterPlatform,
      }),
      APP_WRITER_AGENT: bindings.durableObject({
        worker: 'lantern',
        exportName: 'AppWriterAgent',
      }),
      PYTHON_GRADER_SANDBOX: bindings.durableObject({
        worker: 'lantern',
        exportName: 'PythonGraderSandbox',
      }),
      APP_GENERATION_WORKFLOW: bindings.workflow({
        name: 'lantern-app-generation',
        worker: 'lantern',
        exportName: 'AppGenerationWorkflow',
      }),
      PYTHON_LAB_GENERATION_WORKFLOW: bindings.workflow({
        name: 'lantern-python-lab-generation',
        worker: 'lantern',
        exportName: 'PythonLabGenerationWorkflow',
      }),
      AI: bindings.ai({}),
      LOADER: bindings.workerLoader(),
    },
    exports: {
      LanternLmsCapabilityBinding: exports.worker(),
      AppWriterAgent: exports.durableObject({ storage: 'sqlite' }),
      PythonGraderSandbox: exports.durableObject({ storage: 'sqlite', container: pythonGrader }),
      AppGenerationWorkflow: exports.workflow({
        name: 'lantern-app-generation',
      }),
      PythonLabGenerationWorkflow: exports.workflow({
        name: 'lantern-python-lab-generation',
      }),
    },
  },
  containers: [pythonGrader],
});
