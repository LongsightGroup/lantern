import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  AppWriterAgent,
  normalizeCloudflareAiResponseText,
  normalizeWorkspaceCodeForExecution,
} from './agent.ts';

Deno.test('app writer Agent stores observed Workflow session state', async () => {
  const agent = new AppWriterAgent(createMemoryDurableObjectState(), {});
  const observeResponse = await agent.fetch(
    new Request('https://app-writer-agent.internal/observe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationId: 'generation-1',
        ownerId: 'admin',
        workflowInstanceId: 'workflow-1',
        observedAt: '2026-05-15T12:00:00.000Z',
      }),
    }),
  );
  const stateResponse = await agent.fetch(new Request('https://app-writer-agent.internal/state'));
  const snapshot = (await stateResponse.json()) as {
    generationId?: unknown;
    status?: unknown;
    workflowInstanceId?: unknown;
    updatedAt?: unknown;
  };

  assertEquals(observeResponse.status, 200);
  assertEquals(snapshot.generationId, 'generation-1');
  assertEquals(snapshot.status, 'unknown');
  assertEquals(snapshot.workflowInstanceId, 'workflow-1');
  assertEquals(snapshot.updatedAt, '2026-05-15T12:00:00.000Z');
});

Deno.test('app writer Agent exposes an SSE snapshot stream', async () => {
  const agent = new AppWriterAgent(createMemoryDurableObjectState(), {});
  await agent.fetch(
    new Request('https://app-writer-agent.internal/observe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationId: 'generation-1',
        ownerId: 'admin',
        workflowInstanceId: null,
        observedAt: '2026-05-15T12:00:00.000Z',
      }),
    }),
  );
  const response = await agent.fetch(new Request('https://app-writer-agent.internal/events'));
  const body = await response.text();

  assertEquals(response.headers.get('content-type'), 'text/event-stream; charset=UTF-8');
  assertStringIncludes(body, 'event: snapshot');
  assertStringIncludes(body, '"generationId":"generation-1"');
});

Deno.test('app writer Agent normalizes string SSE model responses before Code Mode', () => {
  const body = [
    'event: message',
    'data: {"response":"async () => {"}',
    '',
    'data: {"response":"\\n  await state.writeFile(\\"/manifest.json\\", \\"{}\\");"}',
    '',
    'data: {"response":"\\n  return { edited: [\\"manifest.json\\"] };\\n}"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');

  assertEquals(
    normalizeCloudflareAiResponseText(body),
    'async () => {\n  await state.writeFile("/manifest.json", "{}");\n  return { edited: ["manifest.json"] };\n}',
  );
});

Deno.test('app writer Agent leaves plain code model responses unchanged', () => {
  const code = 'async () => ({ edited: [] })';

  assertEquals(normalizeCloudflareAiResponseText(code), code);
});

Deno.test('app writer Agent removes top-level arrow semicolon before Code Mode execution', () => {
  const normalized = normalizeWorkspaceCodeForExecution(
    'ignored',
    () => 'async () => {\n  await state.writeFile({ path: "/manifest.json", contents: "{}" });\n};',
  );

  assertEquals(
    normalized,
    'async () => {\n  await state.writeFile({ path: "/manifest.json", contents: "{}" });\n}',
  );
});

function createMemoryDurableObjectState() {
  const stored = new Map<string, unknown>();

  return {
    storage: {
      get<T>(key: string): Promise<T | undefined> {
        return Promise.resolve(stored.get(key) as T | undefined);
      },
      put<T>(key: string, value: T): Promise<void> {
        stored.set(key, structuredClone(value));

        return Promise.resolve();
      },
    },
  };
}
