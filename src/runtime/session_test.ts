import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import {
  authorizeRuntimeSession,
  loadRuntimeActivityContent,
  renderRuntimeSessionPage,
} from './session.ts';
import { buildRuntimeSessionRecord } from '../test_helpers/lti.ts';

const EXAMPLE_SNAPSHOT_ROOT = 'examples/apps/chapter-4-asteroids';

Deno.test('runtime session route serves the pinned reviewed entrypoint with injected bootstrap payload', async () => {
  const html = await renderRuntimeSessionPage(
    buildRuntimeSessionRecord({
      snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
      entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
      contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
    }),
  );

  assertStringIncludes(html, 'GatewayBootstrap');
  assertStringIncludes(html, 'chapter-4-asteroids');
  assertStringIncludes(html, 'runtime-token-123');
  assertStringIncludes(html, 'emitAttemptEvent');
  assertStringIncludes(html, 'finalizeAttempt');
  assertStringIncludes(
    html,
    '/runtime/sessions/runtime-session-123/files/__token__/runtime-token-123/dist/',
  );
  assertStringIncludes(html, '/runtime/sessions/runtime-session-123/attempt-events');
  assertStringIncludes(html, '/runtime/sessions/runtime-session-123/finalize');
});

Deno.test('runtime content route serves reviewed activity content through the Lantern bridge', async () => {
  const content = (await loadRuntimeActivityContent(
    buildRuntimeSessionRecord({
      snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
      entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
      contentPath: `${EXAMPLE_SNAPSHOT_ROOT}/content/activity.json`,
    }),
  )) as { title: string; questions: Array<{ id: string }> };

  assertEquals(content.title, 'Chapter 4 Asteroids');
  assertEquals(content.questions[0]?.id, 'q1');
});

Deno.test('missing or expired runtime session tokens are blocked before artifact bytes are served', async () => {
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        authorizeRuntimeSession({
          token: 'expired-session-token',
          expected: buildRuntimeSessionRecord({
            expiresAt: '2026-03-23T22:40:00Z',
          }),
          now: () => new Date('2026-03-23T22:45:00Z'),
        }),
      ),
    Error,
    'Runtime session token did not match the requested session.',
  );
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        authorizeRuntimeSession({
          token: 'runtime-token-123',
          expected: buildRuntimeSessionRecord({
            expiresAt: '2026-03-23T22:40:00Z',
          }),
          now: () => new Date('2026-03-23T22:45:00Z'),
        }),
      ),
    Error,
    'Runtime session has expired.',
  );
});
