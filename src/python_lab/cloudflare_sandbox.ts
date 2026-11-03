import { Files } from '@cloudflare/sandbox';
import { DurableObject } from 'cloudflare:workers';
import {
  PYTHON_GRADER_COMMAND,
  PYTHON_GRADER_OUTPUT_LIMIT_BYTES,
  type PythonGraderSandboxFactory,
  type SandboxCommandResult,
} from './runner.ts';

/** Owns one disposable Python interpreter with no outbound network access. */
export class PythonGraderSandbox extends DurableObject {
  private getContainer(): Container {
    const container = this.ctx.container;
    if (!container) throw new Error('Python grader container is not configured.');
    if (!container.running) {
      const image = container.images.sandbox;
      if (!image) throw new Error('Python grader image is not configured.');
      container.start({ image, enableInternet: false });
    }
    return container;
  }

  /** Writes the runner-owned source and input files into the disposable workspace. */
  async writeFile(path: string, contents: string): Promise<void> {
    if (
      !['/workspace/solution.py', '/workspace/invoke.py', '/workspace/request.json'].includes(path)
    ) {
      throw new Error('Python grader file path is not allowed.');
    }
    await new Files(this.getContainer()).writeFile(path, contents);
  }

  /** Runs the fixed grading command with bounded time and combined output. */
  async exec(input: {
    command: typeof PYTHON_GRADER_COMMAND;
    timeoutMs: number;
  }): Promise<SandboxCommandResult> {
    if (
      input.command !== PYTHON_GRADER_COMMAND ||
      !Number.isFinite(input.timeoutMs) ||
      input.timeoutMs <= 0
    ) {
      throw new Error('Python grader command or timeout is invalid.');
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(input.timeoutMs)]);
    const process = await this.getContainer().exec(['sh', '-c', PYTHON_GRADER_COMMAND], { signal });
    let outputSize = 0;
    async function readOutput(stream: ReadableStream<Uint8Array> | null): Promise<string> {
      const decoder = new TextDecoder();
      let output = '';
      if (stream !== null) {
        for await (const chunk of stream) {
          outputSize += chunk.byteLength;
          if (outputSize > PYTHON_GRADER_OUTPUT_LIMIT_BYTES) {
            controller.abort();
            throw new Error('Python output exceeded the allowed limit.');
          }
          output += decoder.decode(chunk, { stream: true });
        }
      }
      return output + decoder.decode();
    }
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        readOutput(process.stdout),
        readOutput(process.stderr),
        process.exitCode,
      ]);
      return { stdout, stderr, exitCode };
    } catch (error) {
      process.kill();
      throw error;
    }
  }

  /** Stops the container after the single grading invocation. */
  async destroy(): Promise<void> {
    await this.ctx.container?.destroy();
  }
}

export type PythonGraderSandboxNamespace = Pick<
  DurableObjectNamespace<PythonGraderSandbox>,
  'getByName'
>;

/** Provides one freshly named grader per execution through the Worker binding. */
export function createCloudflarePythonGraderSandboxFactory(
  namespace: PythonGraderSandboxNamespace,
): PythonGraderSandboxFactory {
  return {
    create(oneTimeId) {
      return Promise.resolve(namespace.getByName(oneTimeId));
    },
  };
}

export { PYTHON_GRADER_COMMAND };
