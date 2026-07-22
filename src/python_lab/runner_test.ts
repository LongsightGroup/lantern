import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  executePythonFunction,
  PYTHON_GRADER_COMMAND,
  type PythonGraderSandbox,
  type PythonGraderSandboxFactory,
} from './runner.ts';

Deno.test('executePythonFunction stages a fixed wrapper, parses JSON, and destroys the sandbox', async () => {
  const writes: Array<{ path: string; contents: string }> = [];
  let command = '';
  let destroyed = false;
  const result = await executePythonFunction({
    sandboxFactory: fakeSandboxFactory({
      writeFile(path, contents) {
        writes.push({ path, contents });
        return Promise.resolve();
      },
      exec(input) {
        command = input.command;
        return Promise.resolve({ exitCode: 0, stdout: '{"ok":true,"value":3}', stderr: '' });
      },
      destroy() {
        destroyed = true;
        return Promise.resolve();
      },
    }),
    oneTimeId: 'run-1',
    source: 'def add(a, b): return a + b',
    contract: { functionName: 'add', maxScore: 10 },
    args: [1, 2],
  });

  assertEquals(result, { status: 'passed', value: 3 });
  assertEquals(writes.map((item) => item.path), [
    '/workspace/solution.py',
    '/workspace/invoke.py',
    '/workspace/request.json',
  ]);
  assertEquals(command, PYTHON_GRADER_COMMAND);
  assertStringIncludes(PYTHON_GRADER_COMMAND, 'python3 -I -S');
  assertStringIncludes(writes[1]?.contents ?? '', 'class BoundedOutput');
  assertEquals((writes[1]?.contents ?? '').includes('StandardLibraryOnlyFinder'), false);
  assertEquals(destroyed, true);
});

Deno.test('executePythonFunction rejects malformed output and still destroys the sandbox', async () => {
  let destroyed = false;
  const result = await executePythonFunction({
    sandboxFactory: fakeSandboxFactory({
      writeFile() {
        return Promise.resolve();
      },
      exec() {
        return Promise.resolve({ exitCode: 0, stdout: 'not json', stderr: '' });
      },
      destroy() {
        destroyed = true;
        return Promise.resolve();
      },
    }),
    oneTimeId: 'run-2',
    source: 'def add(a, b): return a + b',
    contract: { functionName: 'add', maxScore: 10 },
    args: [1, 2],
  });

  assertEquals(result, {
    status: 'failed',
    kind: 'runner',
    message: 'Python returned malformed JSON.',
  });
  assertEquals(destroyed, true);
});

Deno.test('executePythonFunction reports sandbox cleanup failure as a runner failure', async () => {
  const result = await executePythonFunction({
    sandboxFactory: fakeSandboxFactory({
      writeFile() {
        return Promise.resolve();
      },
      exec() {
        return Promise.resolve({ exitCode: 0, stdout: '{"ok":true,"value":3}', stderr: '' });
      },
      destroy() {
        return Promise.reject(new Error('sandbox destroy failed'));
      },
    }),
    oneTimeId: 'run-3',
    source: 'def add(a, b): return a + b',
    contract: { functionName: 'add', maxScore: 10 },
    args: [1, 2],
  });

  assertEquals(result, {
    status: 'failed',
    kind: 'runner',
    message: 'sandbox destroy failed',
  });
});

function fakeSandboxFactory(sandbox: PythonGraderSandbox): PythonGraderSandboxFactory {
  return {
    create() {
      return Promise.resolve(sandbox);
    },
  };
}
