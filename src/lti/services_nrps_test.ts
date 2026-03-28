import { assertEquals } from '@std/assert';
import { buildNrpsLaunchService } from '../test_helpers/lti.ts';
import { withFetchStub } from '../test_helpers/fetch_stub.ts';
import { readContextMemberships } from './services.ts';

Deno.test('LTI services client reads paginated NRPS memberships from the launch-scoped context_memberships_url', async () => {
  const nrps = buildNrpsLaunchService();
  const calls: string[] = [];

  const members = await withFetchStub(
    (input) => {
      const url = String(input);

      calls.push(url);

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
              link: '<https://canvas.example/api/lti/courses/42/names_and_roles?page=2>; rel="next"',
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
