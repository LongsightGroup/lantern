import { assertEquals } from '@std/assert';
import { app } from './app.ts';

Deno.test('GET / responds with html', async () => {
  const response = await app.request('http://localhost/');

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'text/html; charset=UTF-8');

  const body = await response.text();
  assertEquals(body.includes('Lantern'), true);
});

Deno.test('GET /health responds with ok', async () => {
  const response = await app.request('http://localhost/health');

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/json');
  assertEquals(await response.json(), { ok: true });
});
