import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { createTestApp as createApp } from './test_helpers/app.ts';
import { renderHomePage } from './pages/home.ts';
import { createInMemoryPackageReviewRepository } from './test_helpers/package_review.ts';

test('GET / serves the operational entry page from renderHomePage', async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/');

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'text/html; charset=UTF-8');

  const body = await response.text();
  assertEquals(body, renderHomePage());
  assertStringIncludes(body, 'Lantern runtime');
});

test('GET /why-it-can-say-yes is not owned by the app Worker', async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/why-it-can-say-yes');

  assertEquals(response.status, 404);
});

test('GET /health responds with ok', async () => {
  const response = await createApp({
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/health');

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/json');
  assertEquals(await response.json(), {
    ok: true,
    appWriterHarness: 'workspace-runner-v1',
  });
});
