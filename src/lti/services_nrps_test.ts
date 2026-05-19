import { assertEquals } from '@std/assert';
import { buildNrpsLaunchService } from '../test_helpers/lti.ts';
import { withFetchStub } from '../test_helpers/fetch_stub.ts';
import { readContextMemberships } from './services.ts';

Deno.test('LTI services client reads paginated NRPS memberships from the launch-scoped context_memberships_url', async () => {
  const nrps = buildNrpsLaunchService();
  const calls: string[] = [];

  const members = await withFetchStub(
    (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);

      calls.push(url);
      assertEquals(headers.get('user-agent'), 'Lantern-LTI-Service/1.0');

      if (url === nrps.contextMembershipsUrl) {
        return new Response(
          JSON.stringify({
            members: [
              {
                user_id: 'canvas-user-123',
                roles: ['Learner'],
                name: 'Ada Lovelace',
                email: 'ada@example.com',
                status: 'Active',
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link:
                '<https://canvas.example/api/lti/courses/42/names_and_roles?page=2>; rel="next"',
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          members: [
            {
              user_id: 'canvas-user-456',
              roles: ['Instructor'],
              name: 'Grace Hopper',
              email: 'grace@example.com',
              status: 'Active',
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    },
    async () =>
      await readContextMemberships({
        accessToken: 'canvas-access-token',
        contextMembershipsUrl: nrps.contextMembershipsUrl,
      }),
  );

  assertEquals(calls, [
    nrps.contextMembershipsUrl,
    'https://canvas.example/api/lti/courses/42/names_and_roles?page=2',
  ]);
  assertEquals(members.length, 2);
  assertEquals(members[0]?.userId, 'canvas-user-123');
  assertEquals(members[1]?.roles, ['Instructor']);
});

Deno.test('LTI services client retries one NRPS page with a fresh token after a 401', async () => {
  const nrps = buildNrpsLaunchService();
  const authorizations: string[] = [];
  let refreshCount = 0;

  const members = await withFetchStub(
    (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const authorization = headers.get('authorization');

      authorizations.push(`${url} ${authorization}`);

      if (authorization === 'Bearer canvas-access-token') {
        return new Response(null, { status: 401 });
      }

      return new Response(
        JSON.stringify({
          members: [
            {
              user_id: 'canvas-user-123',
              roles: ['Learner'],
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    },
    async () =>
      await readContextMemberships({
        accessToken: 'canvas-access-token',
        retryUnauthorized: () => {
          refreshCount += 1;

          return Promise.resolve('canvas-access-token-refreshed');
        },
        contextMembershipsUrl: nrps.contextMembershipsUrl,
      }),
  );

  assertEquals(refreshCount, 1);
  assertEquals(authorizations, [
    `${nrps.contextMembershipsUrl} Bearer canvas-access-token`,
    `${nrps.contextMembershipsUrl} Bearer canvas-access-token-refreshed`,
  ]);
  assertEquals(members.length, 1);
});
