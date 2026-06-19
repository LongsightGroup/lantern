import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { AppWriterAgent, normalizeCloudflareAiResponseText } from './agent.ts';
import { AGENT_SESSION_STORAGE_KEY } from './agent_events.ts';
import type { StoredAppWriterAgentSession } from './agent_types.ts';
import {
  type AgentErrorBody,
  buildWorkspaceAuthorInput,
  buildWorkspaceRepairInput,
  createFakeAiBinding,
  createMemoryDurableObjectState,
  minimalWorkspace,
  type RecordedAiCall,
} from './agent_test_support.ts';
import type { WorkspaceHarnessResponse } from './workspace_harness_result.ts';

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

Deno.test('app writer Agent normalizes string SSE model responses before structured parsing', () => {
  const body = [
    'event: message',
    'data: {"response":"{\\"files\\":["}',
    '',
    'data: {"response":"{\\"path\\":\\"manifest.json\\",\\"contents\\":\\"{}\\\\n\\"}"}',
    '',
    'data: {"response":"],\\"progressUpdates\\":[],\\"notes\\":[],\\"validationFindings\\":[]}"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');

  assertEquals(
    normalizeCloudflareAiResponseText(body),
    '{"files":[{"path":"manifest.json","contents":"{}\\n"}],"progressUpdates":[],"notes":[],"validationFindings":[]}',
  );
});

Deno.test('app writer Agent leaves plain JSON model responses unchanged', () => {
  const body = '{"files":[],"progressUpdates":[],"notes":[],"validationFindings":[]}';

  assertEquals(normalizeCloudflareAiResponseText(body), body);
});

Deno.test('app writer Agent structured author response returns files and model metadata', async () => {
  const calls: RecordedAiCall[] = [];
  const agent = new AppWriterAgent(createMemoryDurableObjectState(), {
    AI: createFakeAiBinding([
      JSON.stringify({
        files: [
          {
            path: 'manifest.json',
            contents: '{"appId":"structured-demo"}\n',
            role: 'package',
          },
        ],
        progressUpdates: [
          {
            stage: 'building_package',
            message: 'Authored package files.',
          },
        ],
        notes: ['Model returned a structured snapshot.'],
        validationFindings: [],
      }),
    ], calls),
    APP_WRITER_MODEL: '@cf/test/model',
  });

  const response = await agent.fetch(
    new Request('https://app-writer-agent.internal/workspace-harness/author', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildWorkspaceAuthorInput()),
    }),
  );
  const body = (await response.json()) as WorkspaceHarnessResponse;
  const firstCall = calls[0];
  assert(firstCall !== undefined);
  const promptText = firstCall.input.messages.map((message) => message.content).join('\n');

  assertEquals(response.status, 200);
  assertEquals(body.files[0]?.path, 'manifest.json');
  assertEquals(body.files[0]?.contents, '{"appId":"structured-demo"}\n');
  assertEquals(body.modelRequestMetadata[0]?.provider, 'cloudflare');
  assertEquals(body.modelRequestMetadata[0]?.model, '@cf/test/model');
  assertEquals(body.modelRequestMetadata[0]?.stage, 'author');
  assertEquals(body.modelRequestMetadata[0]?.attempt, 1);
  assertEquals(body.modelRequestMetadata[0]?.outcome, 'succeeded');
  assertStringIncludes(body.notes.join('\n'), 'completed author on attempt 1');
  assertStringIncludes(promptText, 'Return exactly one raw JSON object');
  assertStringIncludes(promptText, 'Protected workspace context files');
  assertStringIncludes(promptText, 'do not modify or return them');
  assertEquals(promptText.includes('async ()'), false);
  assertEquals(promptText.includes('state.writeFile'), false);
});

Deno.test('app writer Agent structured repair response can remove disallowed files', async () => {
  const agent = new AppWriterAgent(createMemoryDurableObjectState(), {
    AI: createFakeAiBinding([
      JSON.stringify({
        files: [
          {
            path: 'AGENTS.md',
            contents: 'Generated apps stay inside the package contract.\n',
            role: 'instruction',
          },
          {
            path: 'manifest.json',
            contents: '{"appId":"structured-demo"}\n',
            role: 'package',
          },
        ],
        progressUpdates: [
          {
            stage: 'repairing_package',
            message: 'Removed disallowed backend file.',
          },
        ],
        notes: ['Omitted server/worker.ts from the repaired snapshot.'],
        validationFindings: [],
      }),
    ]),
    APP_WRITER_MODEL: '@cf/test/model',
  });

  const response = await agent.fetch(
    new Request('https://app-writer-agent.internal/workspace-harness/repair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildWorkspaceRepairInput()),
    }),
  );
  const body = (await response.json()) as WorkspaceHarnessResponse;

  assertEquals(response.status, 200);
  assertEquals(
    body.files.some((file) => file.path === 'server/worker.ts'),
    false,
  );
});

Deno.test('app writer Agent rejects malformed structured model JSON clearly', async () => {
  const response = await new AppWriterAgent(createMemoryDurableObjectState(), {
    AI: createFakeAiBinding([
      '```json\n{"files":[]}\n```',
      '```json\n{"files":[]}\n```',
      '```json\n{"files":[]}\n```',
    ]),
    APP_WRITER_MODEL: '@cf/test/model',
  }).fetch(
    new Request('https://app-writer-agent.internal/workspace-harness/author', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildWorkspaceAuthorInput()),
    }),
  );
  const body = (await response.json()) as AgentErrorBody;

  assertEquals(response.status, 500);
  assertEquals(body.error?.code, 'structured_response_invalid');
  assertStringIncludes(String(body.error?.message), 'must be raw valid JSON');
  assertEquals(body.error?.modelRequestMetadata?.length, 3);
  assertEquals(body.error?.modelRequestMetadata?.[0]?.outcome, 'failed');
  assertEquals(body.error?.modelRequestMetadata?.[0]?.errorCode, 'structured_response_invalid');
});

Deno.test('app writer Agent rejects structurally invalid structured model JSON clearly', async () => {
  const response = await new AppWriterAgent(createMemoryDurableObjectState(), {
    AI: createFakeAiBinding([
      '{"files":"not-an-array","progressUpdates":[],"notes":[],"validationFindings":[]}',
      '{"files":"not-an-array","progressUpdates":[],"notes":[],"validationFindings":[]}',
      '{"files":"not-an-array","progressUpdates":[],"notes":[],"validationFindings":[]}',
    ]),
    APP_WRITER_MODEL: '@cf/test/model',
  }).fetch(
    new Request('https://app-writer-agent.internal/workspace-harness/author', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildWorkspaceAuthorInput()),
    }),
  );
  const body = (await response.json()) as AgentErrorBody;

  assertEquals(response.status, 500);
  assertEquals(body.error?.code, 'structured_response_invalid');
  assertStringIncludes(String(body.error?.message), 'workspaceHarnessModelResult.files');
  assertEquals(body.error?.modelRequestMetadata?.length, 3);
  assertEquals(body.error?.modelRequestMetadata?.[0]?.errorCode, 'structured_response_invalid');
});

Deno.test('app writer Agent records model progress across structured retry attempts', async () => {
  const state = createMemoryDurableObjectState();
  await state.storage.put<StoredAppWriterAgentSession>(AGENT_SESSION_STORAGE_KEY, {
    generationId: 'generation-1',
    ownerId: 'admin',
    workflowInstanceId: 'workflow-1',
    observedAt: '2026-05-15T12:00:00.000Z',
  });
  const agent = new AppWriterAgent(state, {
    AI: createFakeAiBinding([
      '{"files":"not-an-array","progressUpdates":[],"notes":[],"validationFindings":[]}',
      JSON.stringify({
        files: minimalWorkspace().files,
        progressUpdates: [],
        notes: ['Second attempt succeeded.'],
        validationFindings: [],
      }),
    ]),
    APP_WRITER_MODEL: '@cf/test/model',
  });

  const response = await agent.fetch(
    new Request('https://app-writer-agent.internal/workspace-harness/author', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildWorkspaceAuthorInput()),
    }),
  );
  const stored = await state.storage.get<StoredAppWriterAgentSession>(AGENT_SESSION_STORAGE_KEY);

  assertEquals(response.status, 200);
  assertEquals(stored?.currentModelStage, 'author');
  assertEquals(stored?.currentModelAttempt, 2);
});

Deno.test('app writer Agent path does not expose executable workspace normalization helpers', async () => {
  const agentFacadeSource = await Deno.readTextFile(new URL('./agent.ts', import.meta.url));
  const structuredSource = await Deno.readTextFile(
    new URL('./agent_workspace_structured.ts', import.meta.url),
  );

  assertEquals(agentFacadeSource.includes('normalizeWorkspaceCodeForExecution'), false);
  assertEquals(structuredSource.includes('@cloudflare/codemode'), false);
  assertEquals(structuredSource.includes('DynamicWorkerExecutor'), false);
});

Deno.test('app writer Agent rejects malformed workspace harness input before trusting nested records', async () => {
  const agent = new AppWriterAgent(createMemoryDurableObjectState(), {});
  const response = await agent.fetch(
    new Request('https://app-writer-agent.internal/workspace-harness/author', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationInput: {
          generationId: 'generation-1',
        },
        planning: {},
        workspace: {},
      }),
    }),
  );
  const body = (await response.json()) as {
    error?: {
      code?: unknown;
      message?: unknown;
    };
  };

  assertEquals(response.status, 500);
  assertEquals(body.error?.code, 'workspace_read_write_failed');
  assertStringIncludes(
    String(body.error?.message),
    'workspaceAuthorInput.generationInput.ownerId must be text.',
  );
});
