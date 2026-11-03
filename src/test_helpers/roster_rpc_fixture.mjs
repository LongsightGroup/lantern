import { WorkerEntrypoint } from 'cloudflare:workers';
export class LanternLms extends WorkerEntrypoint {
  listRoster(input) {
    if (input.runtimeSessionId !== 'session-1' || input.runtimeSessionToken !== 'token-1') {
      return { ok: false, error: { code: 'session_expired', traceId: 'trace-denied' } };
    }
    return {
      ok: true,
      value: {
        observedAt: '2026-07-20T15:00:00.000Z',
        members: [
          {
            subjectId: 'subject-1',
            displayName: 'Ada Lovelace',
            roles: ['learner'],
            status: 'active',
            email: 'ada@example.edu',
          },
        ],
      },
    };
  }
}
export default {
  fetch() {
    return new Response('RPC only', { status: 405 });
  },
};
