import { getSandbox, Sandbox } from '@cloudflare/sandbox';
import {
  PYTHON_GRADER_COMMAND,
  PYTHON_GRADER_OUTPUT_LIMIT_BYTES,
  type PythonGraderSandbox as PythonGraderSandboxPort,
  type PythonGraderSandboxFactory,
  type SandboxCommandResult,
} from './runner.ts';

export class PythonGraderSandbox extends Sandbox {
  override enableInternet = false;
}

type PythonGraderSandboxNamespace = Parameters<typeof getSandbox<PythonGraderSandbox>>[0];

export function createCloudflarePythonGraderSandboxFactory(
  namespace: PythonGraderSandboxNamespace,
): PythonGraderSandboxFactory {
  return {
    create(oneTimeId) {
      const sandbox = getSandbox(namespace, oneTimeId);

      return Promise.resolve(
        {
          async writeFile(path, contents) {
            await sandbox.writeFile(path, contents);
          },
          async exec(input) {
            const controller = new AbortController();
            let outputSize = 0;
            const result = await sandbox.exec(input.command, {
              timeout: input.timeoutMs,
              stream: true,
              signal: controller.signal,
              onOutput(_stream, chunk) {
                outputSize += new TextEncoder().encode(chunk).byteLength;
                if (outputSize > PYTHON_GRADER_OUTPUT_LIMIT_BYTES) {
                  controller.abort('Python output exceeded the allowed limit.');
                }
              },
            });

            return normalizeCommandResult(result);
          },
          destroy() {
            return sandbox.destroy();
          },
        } satisfies PythonGraderSandboxPort,
      );
    },
  };
}

function normalizeCommandResult(input: {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}): SandboxCommandResult {
  return {
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
  };
}

export { PYTHON_GRADER_COMMAND };
