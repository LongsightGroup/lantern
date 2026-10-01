import { assertEquals, assertRejects } from '@std/assert';
import type { D1Database } from '../db/d1.ts';
import { runD1 } from '../db/d1.ts';
import { withKernelD1 } from './d1_test_support.ts';
import { adminGovernanceEvent } from './governance_events.ts';
import { createD1LmsKernelRepository } from './repository_d1.ts';

const NOW = '2026-07-20T15:00:00.000Z';

Deno.test('D1 rolls back a governed mutation when its audit event cannot commit', async () => {
  await withKernelD1(async (db) => {
    await seedAuthUser(db, 'owner-1');
    const repository = createD1LmsKernelRepository(db);

    await assertRejects(() =>
      repository.createInstitutionWithOwner({
        id: 'institution-rollback',
        slug: 'rollback-university',
        name: 'Rollback University',
        ownerUserId: 'owner-1',
        now: NOW,
        event: adminGovernanceEvent({
          traceId: 'trace-rollback',
          eventType: 'institution.created',
          institutionId: 'institution-rollback',
          packageVersionId: 999_999,
          actorId: 'owner-1',
          occurredAt: NOW,
        }),
      })
    );

    assertEquals(await repository.getInstitutionById('institution-rollback'), null);
    assertEquals(await repository.listMembershipsForUser('owner-1'), []);
  });
});

Deno.test('D1 invitation acceptance is one-time and appends its audit event atomically', async () => {
  await withKernelD1(async (db) => {
    await Promise.all([seedAuthUser(db, 'owner-1'), seedAuthUser(db, 'admin-1')]);
    const repository = createD1LmsKernelRepository(db);
    await repository.createInstitutionWithOwner({
      id: 'institution-1',
      slug: 'example-university',
      name: 'Example University',
      ownerUserId: 'owner-1',
      now: NOW,
      event: adminGovernanceEvent({
        traceId: 'trace-institution',
        eventType: 'institution.created',
        institutionId: 'institution-1',
        actorId: 'owner-1',
        occurredAt: NOW,
      }),
    });
    await repository.createInvite({
      id: 'invite-1',
      institutionId: 'institution-1',
      tokenHash: 'hashed-token',
      role: 'admin',
      createdByUserId: 'owner-1',
      createdAt: NOW,
      expiresAt: '2026-07-27T15:00:00.000Z',
      event: adminGovernanceEvent({
        traceId: 'trace-invite',
        eventType: 'institution_invite.created',
        institutionId: 'institution-1',
        actorId: 'owner-1',
        occurredAt: NOW,
      }),
    });

    const accepted = await repository.acceptInvite({
      tokenHash: 'hashed-token',
      userId: 'admin-1',
      acceptedAt: '2026-07-20T15:01:00.000Z',
      traceId: 'trace-accepted',
    });
    const replay = await repository.acceptInvite({
      tokenHash: 'hashed-token',
      userId: 'admin-1',
      acceptedAt: '2026-07-20T15:01:00.000Z',
      traceId: 'trace-replay',
    });

    assertEquals(accepted?.role, 'admin');
    assertEquals(replay, null);
    assertEquals(
      (await repository.listGovernanceEvents({
        institutionId: 'institution-1',
        traceId: 'trace-accepted',
      })).length,
      1,
    );
    await assertRejects(
      () =>
        runD1(db, `UPDATE governance_events SET outcome = 'failed' WHERE trace_id = ?`, [
          'trace-accepted',
        ]),
      Error,
      'governance_events is append-only',
    );
    await assertRejects(
      () => runD1(db, `DELETE FROM governance_events WHERE trace_id = ?`, ['trace-accepted']),
      Error,
      'governance_events is append-only',
    );
  });
});

function seedAuthUser(db: D1Database, id: string): Promise<void> {
  return runD1(
    db,
    `
      INSERT INTO auth_users (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, ?)
    `,
    [id, id, `${id}@example.edu`, NOW, NOW],
  );
}
