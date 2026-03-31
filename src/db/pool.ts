import { Pool } from "@db/postgres";

const DEFAULT_POOL_SIZE = 3;

export function requireDatabaseUrl(): string {
  const databaseUrl = Deno.env.get("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for Lantern package review persistence.",
    );
  }

  return databaseUrl;
}

export function createDatabasePool(size = DEFAULT_POOL_SIZE): Pool {
  return new Pool(requireDatabaseUrl(), size, true);
}
