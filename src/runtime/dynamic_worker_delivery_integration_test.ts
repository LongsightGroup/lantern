import { env } from 'cloudflare:workers';
import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';

test('Photo Roster bundle runs in workerd and reaches roster data only through RPC', async () => {
  const response = await env.PHOTO_ROSTER.fetch('https://photo-roster.internal/', {
    headers: {
      'x-lantern-runtime-session-id': 'session-1',
      'x-lantern-runtime-session-token': 'token-1',
      'x-lantern-trace-id': 'trace-1',
    },
  });
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('cache-control'), 'private, no-store');
  assertStringIncludes(html, 'Ada Lovelace');
  assertStringIncludes(html, 'ada@example.edu');
});
