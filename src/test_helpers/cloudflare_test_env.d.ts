import type { D1Migration } from '@cloudflare/vitest-plugin';

// Cloudflare's runtime types intentionally merge test binding declarations here.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      BROWSER: unknown;
      PHOTO_ROSTER: Fetcher;
    }
  }
}
