import { assertEquals } from '@std/assert';
import { createCloudflareAppWriterAgentSessionCoordinator } from './agent_session.ts';

Deno.test('app writer Agent session coordinator routes observe and events to generation-named agent instances', async () => {
  const stub = createStubAgent();
  const coordinator = createCloudflareAppWriterAgentSessionCoordinator({
    idFromName(name) {
      return `id:${name}`;
    },
    get(id) {
      assertEquals(id, 'id:generation-1');
      return stub;
    },
  });

  await coordinator.observe({
    generationId: 'generation-1',
    ownerId: 'admin',
    workflowInstanceId: 'workflow-1',
    observedAt: '2026-05-15T12:00:00.000Z',
  });
  const state = await coordinator.fetchState('generation-1');
  const eventsResponse = await coordinator.fetchEvents(
    'generation-1',
    new Request('https://lantern.example/admin/app-writer/runs/generation-1/events'),
  );

  assertEquals(stub.paths, ['/observe', '/state', '/events']);
  assertEquals(state.generationId, 'generation-1');
  assertEquals(eventsResponse.headers.get('content-type'), 'text/event-stream');
});

function createStubAgent() {
  return {
    paths: [] as string[],
    fetch(request: Request) {
      const pathname = new URL(request.url).pathname;
      this.paths.push(pathname);

      if (pathname === '/observe') {
        return Promise.resolve(Response.json({ ok: true }));
      }

      if (pathname === '/state') {
        return Promise.resolve(
          Response.json({
            generationId: 'generation-1',
            status: 'planning',
            currentPlanStepId: 'create_app_plan',
            currentPlanStepStatus: 'running',
            workflowInstanceId: 'workflow-1',
            packageVersionId: null,
            repairAttemptCount: 0,
            validationFindingCount: 0,
            activityEventCount: 2,
            updatedAt: '2026-05-15T12:00:00.000Z',
          }),
        );
      }

      return Promise.resolve(
        new Response('', {
          headers: {
            'content-type': 'text/event-stream',
          },
        }),
      );
    },
  };
}
