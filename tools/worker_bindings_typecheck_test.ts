import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vite-plus/test';

test('generated Worker bindings resolve and reject invalid names and values', async () => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  // Keep the generated declaration's relative config import at its original depth.
  const root = await mkdtemp(join(projectRoot, '.cloudflare/typecheck-'));
  try {
    // Check our generated declarations as source so skipLibCheck cannot hide errors
    // in them. Third-party declarations retain the project's normal checking policy.
    await writeFile(
      join(root, 'bindings.ts'),
      await readFile(join(projectRoot, '.cloudflare/types/index.d.ts'), 'utf8'),
    );
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        extends: '../../tsconfig.json',
        include: ['bindings.ts', 'probe.ts'],
        exclude: [],
      }),
    );
    const compilerPath = fileURLToPath(
      new URL('./bin/tsc', import.meta.resolve('typescript/package.json')),
    );
    const compile = () => {
      const result = spawnSync(
        process.execPath,
        [compilerPath, '--project', join(root, 'tsconfig.json'), '--pretty', 'false'],
        { cwd: projectRoot, encoding: 'utf8', timeout: 30000 },
      );
      if (result.error) throw result.error;
      return result;
    };

    await writeFile(
      join(root, 'probe.ts'),
      `import { env } from 'cloudflare:workers';
const secret: string = env.BETTER_AUTH_SECRET;
env.DB.prepare('SELECT 1');
void secret;
`,
    );
    const valid = compile();
    equal(valid.status, 0, valid.stdout + valid.stderr);

    await writeFile(
      join(root, 'probe.ts'),
      `import { env } from 'cloudflare:workers';
const wrongSecret: number = env.BETTER_AUTH_SECRET;
env.DEFINITELY_NOT_A_REAL_LANTERN_BINDING;
env.DB.notARealD1Method();
void wrongSecret;
`,
    );
    const invalid = compile();
    ok(invalid.status !== null && invalid.status !== 0, invalid.stdout + invalid.stderr);
    deepStrictEqual(
      [...invalid.stdout.matchAll(/probe\.ts\((\d+),\d+\): error TS(\d+):/g)].map((diagnostic) => [
        Number(diagnostic[1]),
        Number(diagnostic[2]),
      ]),
      [
        [2, 2322],
        [3, 2339],
        [4, 2339],
      ],
      invalid.stdout + invalid.stderr,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
