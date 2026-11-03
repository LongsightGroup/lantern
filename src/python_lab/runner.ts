import { type JsonValue, parseJsonValue, type PythonFunctionContract } from './contract.ts';

export const PYTHON_GRADER_COMMAND = 'python3 -I -S /workspace/invoke.py < /workspace/request.json';
export const PYTHON_GRADER_OUTPUT_LIMIT_BYTES = 16_384;
export const PYTHON_GRADER_TIMEOUT_MS = 4_000;

export interface SandboxCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PythonGraderSandbox {
  writeFile(path: string, contents: string): Promise<void>;
  exec(input: {
    readonly command: typeof PYTHON_GRADER_COMMAND;
    readonly timeoutMs: number;
  }): Promise<SandboxCommandResult>;
  destroy(): Promise<void>;
}

export interface PythonGraderSandboxFactory {
  create(oneTimeId: string): Promise<PythonGraderSandbox>;
}

export function createUnavailablePythonGraderSandboxFactory(
  message: string,
): PythonGraderSandboxFactory {
  return {
    create() {
      return Promise.reject(new Error(message));
    },
  };
}

export type PythonExecutionOutcome =
  | { readonly status: 'passed'; readonly value: JsonValue }
  | {
      readonly status: 'failed';
      readonly kind: 'submission' | 'runner';
      readonly message: string;
    };

export async function executePythonFunction(input: {
  readonly sandboxFactory: PythonGraderSandboxFactory;
  readonly oneTimeId: string;
  readonly source: string;
  readonly contract: PythonFunctionContract;
  readonly args: readonly JsonValue[];
  readonly timeoutMs?: number;
}): Promise<PythonExecutionOutcome> {
  let sandbox: PythonGraderSandbox;

  try {
    sandbox = await input.sandboxFactory.create(input.oneTimeId);
  } catch (error) {
    return {
      status: 'failed',
      kind: 'runner',
      message: error instanceof Error ? error.message : 'The Python runner failed.',
    };
  }

  let outcome: PythonExecutionOutcome;

  try {
    await sandbox.writeFile('/workspace/solution.py', input.source);
    await sandbox.writeFile('/workspace/invoke.py', PYTHON_INVOCATION_WRAPPER);
    await sandbox.writeFile(
      '/workspace/request.json',
      JSON.stringify({ functionName: input.contract.functionName, args: input.args }),
    );
    const result = await sandbox.exec({
      command: PYTHON_GRADER_COMMAND,
      timeoutMs: input.timeoutMs ?? PYTHON_GRADER_TIMEOUT_MS,
    });

    outcome = parsePythonExecutionResult(result);
  } catch (error) {
    outcome = {
      status: 'failed',
      kind: 'runner',
      message: error instanceof Error ? error.message : 'The Python runner failed.',
    };
  }

  try {
    await sandbox.destroy();
  } catch (error) {
    return {
      status: 'failed',
      kind: 'runner',
      message: error instanceof Error ? error.message : 'The Python runner cleanup failed.',
    };
  }

  return outcome;
}

function parsePythonExecutionResult(result: SandboxCommandResult): PythonExecutionOutcome {
  if (
    new TextEncoder().encode(result.stdout).byteLength > PYTHON_GRADER_OUTPUT_LIMIT_BYTES ||
    new TextEncoder().encode(result.stderr).byteLength > PYTHON_GRADER_OUTPUT_LIMIT_BYTES
  ) {
    return {
      status: 'failed',
      kind: 'runner',
      message: 'Python output exceeded the allowed limit.',
    };
  }

  if (result.exitCode !== 0) {
    return { status: 'failed', kind: 'runner', message: 'Python execution did not complete.' };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(result.stdout);
  } catch {
    return { status: 'failed', kind: 'runner', message: 'Python returned malformed JSON.' };
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      status: 'failed',
      kind: 'runner',
      message: 'Python returned an invalid result envelope.',
    };
  }

  const record = payload as Record<string, unknown>;

  if (record.ok === true) {
    try {
      return { status: 'passed', value: parseJsonValue(record.value, 'Python function result') };
    } catch (error) {
      return {
        status: 'failed',
        kind: 'runner',
        message: error instanceof Error ? error.message : 'Python returned an invalid JSON value.',
      };
    }
  }

  if (record.ok === false && typeof record.error === 'string') {
    return { status: 'failed', kind: 'submission', message: record.error.slice(0, 400) };
  }

  return {
    status: 'failed',
    kind: 'runner',
    message: 'Python returned an invalid result envelope.',
  };
}

const PYTHON_INVOCATION_WRAPPER = String.raw`import contextlib
import importlib.util
import io
import json
import sys

MAX_LEARNER_OUTPUT_BYTES = 4096

class BoundedOutput(io.TextIOBase):
    def __init__(self):
        self.size = 0

    def write(self, value):
        encoded = value.encode("utf-8")
        self.size += len(encoded)
        if self.size > MAX_LEARNER_OUTPUT_BYTES:
            raise RuntimeError("Learner output exceeded the allowed limit.")
        return len(value)

def emit(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))

try:
    request = json.load(sys.stdin)
    function_name = request["functionName"]
    args = request["args"]
    if not isinstance(function_name, str) or not isinstance(args, list):
        raise ValueError("Invalid invocation request.")

    spec = importlib.util.spec_from_file_location("learner_solution", "/workspace/solution.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load solution.py.")
    module = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(BoundedOutput()), contextlib.redirect_stderr(BoundedOutput()):
        spec.loader.exec_module(module)
        function = getattr(module, function_name)
        if not callable(function):
            raise TypeError("Required function was not defined.")
        value = function(*args)
    json.dumps(value, allow_nan=False)
    emit({"ok": True, "value": value})
except Exception as error:
    emit({"ok": False, "error": f"{type(error).__name__}: {error}"})
`;
