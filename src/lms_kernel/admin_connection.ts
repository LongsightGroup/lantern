import type { InstitutionMembershipRecord, LmsConnectionRecord, LmsPlatformType } from './types.ts';
import { failure, type KernelAdminResult } from './admin_result.ts';
import { canGovern, type KernelAdminDeps, parseConnectionFields } from './admin_support.ts';
import { adminGovernanceEvent } from './governance_events.ts';

export function createConnection(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly label: string;
    readonly platformType: LmsPlatformType;
    readonly issuer?: string;
    readonly clientId?: string;
    readonly deploymentId?: string;
    readonly authorizationEndpoint?: string;
    readonly accessTokenUrl?: string;
    readonly jwksUrl?: string;
  },
): Promise<KernelAdminResult<LmsConnectionRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure(
        'permission_denied',
        'Only institution owners and admins can create LMS connections.',
      );
    }
    const label = command.label.trim();
    if (label.length === 0 || label.length > 120) {
      return failure('invalid_request', 'Connection label is required.');
    }
    const connectionFields = parseConnectionFields(command);
    if (!connectionFields.ok) {
      return connectionFields;
    }
    const createdAt = deps.now().toISOString();
    const connectionId = deps.createId();
    const connection = await deps.repository.createLmsConnection({
      id: connectionId,
      institutionId: command.membership.institutionId,
      label,
      platformType: command.platformType,
      ...connectionFields.value,
      now: createdAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'lms_connection.created',
        institutionId: command.membership.institutionId,
        lmsConnectionId: connectionId,
        actorId: command.membership.userId,
        occurredAt: createdAt,
      }),
    });
    if (command.platformType === 'synthetic') {
      const active = await deps.repository.activateLmsConnection({
        id: connection.id,
        validatedAt: createdAt,
        event: adminGovernanceEvent({
          traceId: deps.createId(),
          eventType: 'lms_connection.validated',
          institutionId: connection.institutionId,
          lmsConnectionId: connection.id,
          actorId: command.membership.userId,
          occurredAt: createdAt,
        }),
      });
      if (active === null) {
        return failure('not_found', 'Synthetic connection was not found after creation.');
      }
      await deps.repository.getOrCreateLmsContext({
        id: deps.createId(),
        institutionId: active.institutionId,
        lmsConnectionId: active.id,
        providerContextId: 'synthetic-course',
        label: 'Synthetic course',
        now: createdAt,
      });
      return { ok: true, value: active };
    }
    // Real platforms carry an LTI registration in the lti-tool protocol cache.
    // `lms_connections` stays authoritative; project it into that cache here so
    // launches can complete without waiting for the login-time sync.
    if (deps.syncLtiToolRegistration !== undefined) {
      await deps.syncLtiToolRegistration(connection);
    }
    return { ok: true, value: connection };
  })();
}

export function disableConnection(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly connectionId: string;
  },
): Promise<KernelAdminResult<LmsConnectionRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure(
        'permission_denied',
        'Only institution owners and admins can disable LMS connections.',
      );
    }
    const existing = await deps.repository.getLmsConnectionById(command.connectionId);
    if (existing === null || existing.institutionId !== command.membership.institutionId) {
      return failure('not_found', 'LMS connection was not found.');
    }
    const disabledAt = deps.now().toISOString();
    const connection = await deps.repository.disableLmsConnection({
      id: command.connectionId,
      institutionId: command.membership.institutionId,
      disabledAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'lms_connection.disabled',
        institutionId: command.membership.institutionId,
        lmsConnectionId: command.connectionId,
        actorId: command.membership.userId,
        occurredAt: disabledAt,
      }),
    });
    if (connection === null) {
      return failure('not_found', 'LMS connection was not found.');
    }
    return { ok: true, value: connection };
  })();
}
