import { Miniflare } from 'miniflare';
import type { D1Database } from '../db/d1.ts';
import { runD1Statements } from '../db/d1.ts';

/** Runs a kernel persistence test against isolated D1 with the actual schema. */
export async function withKernelD1(run: (db: D1Database) => Promise<void>): Promise<void> {
  const miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    d1Databases: { DB: crypto.randomUUID() },
  });
  try {
    const db: D1Database = await miniflare.getD1Database('DB');
    for (
      const migration of [
        '0001_initial_schema.sql',
        '0002_auth.sql',
        '0003_python_autograder_lab.sql',
        '0004_governed_lms_primitive_kernel.sql',
      ]
    ) {
      await runD1Statements(db, await Deno.readTextFile(`src/db/d1_migrations/${migration}`));
    }
    await run(db);
  } finally {
    await miniflare.dispose();
  }
}
