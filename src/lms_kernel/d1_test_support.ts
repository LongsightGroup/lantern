import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import type { D1Database } from '../db/d1.ts';

/** Runs a persistence test against fresh D1 storage with the actual migrations. */
export async function withKernelD1(run: (db: D1Database) => Promise<void>): Promise<void> {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await run(env.DB);
}
