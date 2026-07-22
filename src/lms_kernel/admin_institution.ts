import type { InstitutionMembershipRecord, InstitutionRecord } from './types.ts';
import { failure, type KernelAdminResult } from './admin_result.ts';
import { canGovern, institutionSlug, type KernelAdminDeps, sha256 } from './admin_support.ts';
import { adminGovernanceEvent } from './governance_events.ts';

export function createInstitution(
  deps: KernelAdminDeps,
  command: { readonly userId: string; readonly name: string },
): Promise<KernelAdminResult<InstitutionRecord>> {
  return (async () => {
    if ((await deps.repository.listMembershipsForUser(command.userId)).length > 0) {
      return failure('invalid_request', 'This administrator already belongs to an institution.');
    }
    const name = command.name.trim();
    if (name.length < 2 || name.length > 120) {
      return failure('invalid_request', 'Institution name must be between 2 and 120 characters.');
    }
    const createdAt = deps.now().toISOString();
    const institutionId = deps.createId();
    const institution = await deps.repository.createInstitutionWithOwner({
      id: institutionId,
      slug: institutionSlug(name, deps.createId()),
      name,
      ownerUserId: command.userId,
      now: createdAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'institution.created',
        institutionId,
        actorId: command.userId,
        occurredAt: createdAt,
      }),
    });
    return { ok: true, value: institution };
  })();
}

export function createInvite(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly role: 'admin' | 'auditor';
  },
): Promise<KernelAdminResult<{ readonly token: string; readonly expiresAt: string }>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure('permission_denied', 'Only institution owners and admins can invite users.');
    }
    const token = deps.createSecret();
    const createdAt = deps.now();
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inviteId = deps.createId();
    await deps.repository.createInvite({
      id: inviteId,
      institutionId: command.membership.institutionId,
      tokenHash: await sha256(token),
      role: command.role,
      createdByUserId: command.membership.userId,
      createdAt: createdAt.toISOString(),
      expiresAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'institution_invite.created',
        institutionId: command.membership.institutionId,
        actorId: command.membership.userId,
        occurredAt: createdAt.toISOString(),
      }),
    });
    return { ok: true, value: { token, expiresAt } };
  })();
}

export function acceptInvite(
  deps: KernelAdminDeps,
  command: { readonly userId: string; readonly token: string },
): Promise<KernelAdminResult<InstitutionMembershipRecord>> {
  return (async () => {
    const membership = await deps.repository.acceptInvite({
      tokenHash: await sha256(command.token),
      userId: command.userId,
      acceptedAt: deps.now().toISOString(),
      traceId: deps.createId(),
    });
    if (membership === null) {
      return failure('not_found', 'This invitation is invalid, expired, or already used.');
    }
    return { ok: true, value: membership };
  })();
}
