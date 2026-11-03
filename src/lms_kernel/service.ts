import type {
  PrimitiveErrorCode,
  PrimitiveResult,
  RosterListInput,
  RosterMember,
  RosterPage,
} from '../../sdk/worker-app-sdk.ts';
import type { EnvReader } from '../platform/env.ts';
import { signRosterCursor, verifyRosterCursor } from './cursor.ts';
import type { RosterConnector } from './connector.ts';
import { parseRosterListInput } from './parsing.ts';
import { authorizeRosterRead, requiredRosterCapabilities } from './policy.ts';
import type { LmsKernelRepository } from './repository.ts';
import type {
  CapabilityGrantRecord,
  GovernedRuntimeSession,
  RosterConnectorMember,
} from './types.ts';

const CONTINUATION_TTL_MS = 10 * 60 * 1000;
const MEDIA_TTL_MS = 5 * 60 * 1000;

export interface GovernedRosterService {
  listRoster(input: {
    readonly runtimeSessionId: string;
    readonly runtimeSessionToken: string;
    readonly traceId?: string;
    readonly request: unknown;
    readonly bindingIdentity?: {
      readonly appId: string;
      readonly packageVersionId: number;
    };
    readonly requestMetadata?: Readonly<Record<string, string>>;
  }): Promise<PrimitiveResult<RosterPage>>;
}

export function createGovernedRosterService(input: {
  readonly repository: LmsKernelRepository;
  readonly nrpsConnector: RosterConnector;
  readonly syntheticConnector: RosterConnector;
  readonly env: EnvReader;
  readonly publicOrigin: string;
  readonly createId?: () => string;
  readonly now?: () => Date;
}): GovernedRosterService {
  const createId = input.createId ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());

  return {
    async listRoster(command) {
      const traceId = command.traceId ?? createId();
      const parsed = parseRosterListInput(command.request);
      if (!parsed.ok) {
        return primitiveFailure('invalid_request', traceId);
      }

      const observedAt = now();
      const session = await input.repository.getGovernedRuntimeSession({
        runtimeSessionId: command.runtimeSessionId,
        runtimeSessionToken: command.runtimeSessionToken,
      });
      if (session === null) {
        return primitiveFailure('session_expired', traceId);
      }
      if (
        command.bindingIdentity !== undefined &&
        (command.bindingIdentity.appId !== session.appId ||
          command.bindingIdentity.packageVersionId !== session.packageVersionId)
      ) {
        await recordDecision({
          repository: input.repository,
          session,
          traceId,
          grants: [],
          capabilities: requiredRosterCapabilities(parsed.value.fields),
          decision: 'denied',
          outcome: 'failed',
          errorCode: 'permission_denied',
          requestMetadata: command.requestMetadata ?? {},
          occurredAt: observedAt.toISOString(),
        });
        return primitiveFailure('permission_denied', traceId);
      }

      const grants = await input.repository.listCapabilityGrants(session.appInstallationId);
      const capabilities = requiredRosterCapabilities(parsed.value.fields);
      const authorization = authorizeRosterRead({
        session,
        grants,
        requestedCapabilities: capabilities,
        now: observedAt,
      });
      if (!authorization.allowed) {
        const code =
          authorization.reason === 'session_expired' ? 'session_expired' : 'permission_denied';
        await recordDecision({
          repository: input.repository,
          session,
          traceId,
          grants: [],
          capabilities,
          decision: 'denied',
          outcome: 'failed',
          errorCode: code,
          requestMetadata: command.requestMetadata ?? {},
          occurredAt: observedAt.toISOString(),
        });
        return primitiveFailure(code, traceId);
      }

      await recordDecision({
        repository: input.repository,
        session,
        traceId,
        grants: authorization.grants,
        capabilities,
        decision: 'allowed',
        outcome: 'completed',
        errorCode: null,
        requestMetadata: command.requestMetadata ?? {},
        occurredAt: observedAt.toISOString(),
      });

      const continuation = await resolveContinuation({
        repository: input.repository,
        env: input.env,
        session,
        cursor: parsed.value.cursor,
        now: observedAt,
      });
      if (!continuation.ok) {
        await recordCompletion({
          repository: input.repository,
          session,
          traceId,
          outcome: 'failed',
          objectCount: null,
          latencyMs: null,
          errorCode: 'invalid_request',
          occurredAt: now().toISOString(),
        });
        return primitiveFailure('invalid_request', traceId);
      }

      const connector =
        session.connectorKind === 'synthetic' ? input.syntheticConnector : input.nrpsConnector;
      const startedAt = performance.now();
      const connectorResult = await connector.listPage({
        session,
        continuation: continuation.value,
      });
      if (!connectorResult.ok) {
        await recordCompletion({
          repository: input.repository,
          session,
          traceId,
          outcome: connectorResult.errorCode === 'rate_limited' ? 'limited' : 'failed',
          objectCount: null,
          latencyMs: elapsedMilliseconds(startedAt),
          errorCode: connectorResult.errorCode,
          occurredAt: now().toISOString(),
        });
        return primitiveFailure(connectorResult.errorCode, traceId);
      }

      const expiresAt = new Date(observedAt.getTime() + MEDIA_TTL_MS).toISOString();
      const members: RosterMember[] = [];
      for (const member of connectorResult.page.members) {
        members.push(
          await materializeMember({
            repository: input.repository,
            session,
            member,
            fields: parsed.value.fields,
            publicOrigin: input.publicOrigin,
            expiresAt,
            now: observedAt.toISOString(),
            traceId,
            createId,
          }),
        );
      }

      const nextCursor =
        connectorResult.page.nextContinuation === null
          ? undefined
          : await persistContinuation({
              repository: input.repository,
              env: input.env,
              session,
              continuation: connectorResult.page.nextContinuation,
              now: observedAt,
              createId,
            });

      await recordCompletion({
        repository: input.repository,
        session,
        traceId,
        outcome: 'completed',
        objectCount: members.length,
        latencyMs: elapsedMilliseconds(startedAt),
        errorCode: null,
        occurredAt: now().toISOString(),
      });

      const value: RosterPage = {
        members,
        observedAt: observedAt.toISOString(),
        ...(nextCursor === undefined ? {} : { nextCursor }),
      };
      return { ok: true, value };
    },
  };
}

async function resolveContinuation(input: {
  readonly repository: LmsKernelRepository;
  readonly env: EnvReader;
  readonly session: GovernedRuntimeSession;
  readonly cursor: string | undefined;
  readonly now: Date;
}): Promise<{ readonly ok: true; readonly value: string | null } | { readonly ok: false }> {
  if (input.cursor === undefined) {
    return { ok: true, value: null };
  }
  const verified = await verifyRosterCursor({
    cursor: input.cursor,
    env: input.env,
    now: input.now,
  });
  if (
    !verified.ok ||
    verified.payload.runtimeSessionId !== input.session.runtimeSessionId ||
    verified.payload.lmsContextId !== input.session.lmsContextId ||
    verified.payload.appInstallationId !== input.session.appInstallationId ||
    verified.payload.packageVersionId !== input.session.packageVersionId ||
    verified.payload.connectorKind !== input.session.connectorKind
  ) {
    return { ok: false };
  }
  const continuation = await input.repository.getRosterContinuation(
    verified.payload.continuationId,
  );
  if (
    continuation === null ||
    Date.parse(continuation.expiresAt) <= input.now.getTime() ||
    continuation.runtimeSessionId !== input.session.runtimeSessionId ||
    continuation.appInstallationId !== input.session.appInstallationId ||
    continuation.packageVersionId !== input.session.packageVersionId ||
    continuation.connectorKind !== input.session.connectorKind
  ) {
    return { ok: false };
  }
  return { ok: true, value: continuation.continuationValue };
}

async function persistContinuation(input: {
  readonly repository: LmsKernelRepository;
  readonly env: EnvReader;
  readonly session: GovernedRuntimeSession;
  readonly continuation: string;
  readonly now: Date;
  readonly createId: () => string;
}): Promise<string> {
  const id = input.createId();
  const expiresAt = new Date(input.now.getTime() + CONTINUATION_TTL_MS).toISOString();
  await input.repository.saveRosterContinuation({
    id,
    runtimeSessionId: input.session.runtimeSessionId,
    appInstallationId: input.session.appInstallationId,
    packageVersionId: input.session.packageVersionId,
    connectorKind: input.session.connectorKind,
    continuationValue: input.continuation,
    expiresAt,
  });
  return await signRosterCursor({
    payload: {
      continuationId: id,
      runtimeSessionId: input.session.runtimeSessionId,
      lmsContextId: input.session.lmsContextId,
      appInstallationId: input.session.appInstallationId,
      packageVersionId: input.session.packageVersionId,
      connectorKind: input.session.connectorKind,
      expiresAt,
    },
    env: input.env,
  });
}

async function materializeMember(input: {
  readonly repository: LmsKernelRepository;
  readonly session: GovernedRuntimeSession;
  readonly member: RosterConnectorMember;
  readonly fields: RosterListInput['fields'];
  readonly publicOrigin: string;
  readonly expiresAt: string;
  readonly now: string;
  readonly traceId: string;
  readonly createId: () => string;
}): Promise<RosterMember> {
  const subjectId = await input.repository.getOrCreateSubjectIdentity({
    id: input.createId(),
    institutionId: input.session.institutionId,
    lmsConnectionId: input.session.lmsConnectionId,
    providerSubjectId: input.member.providerSubjectId,
    now: input.now,
  });
  let photo: RosterMember['photo'];
  if (input.fields.includes('photo') && input.member.pictureUrl !== null) {
    const mediaId = input.createId();
    await input.repository.saveProtectedMediaReference({
      id: mediaId,
      traceId: input.traceId,
      institutionId: input.session.institutionId,
      lmsConnectionId: input.session.lmsConnectionId,
      lmsContextId: input.session.lmsContextId,
      runtimeSessionId: input.session.runtimeSessionId,
      appInstallationId: input.session.appInstallationId,
      packageVersionId: input.session.packageVersionId,
      subjectIdentityId: subjectId,
      actorSubjectId: input.session.actorSubjectId,
      actorType: input.session.actorType,
      connectorKind: input.session.connectorKind,
      sourceUrl: input.member.pictureUrl,
      expiresAt: input.expiresAt,
    });
    photo = {
      url: `${input.publicOrigin}/runtime/media/${encodeURIComponent(mediaId)}`,
      expiresAt: input.expiresAt,
    };
  }

  return {
    subjectId,
    displayName: input.member.displayName,
    roles: input.member.roles,
    status: input.member.status,
    ...(input.fields.includes('email') && input.member.email !== null
      ? { email: input.member.email }
      : {}),
    ...(photo === undefined ? {} : { photo }),
  };
}

async function recordDecision(input: {
  readonly repository: LmsKernelRepository;
  readonly session: GovernedRuntimeSession;
  readonly traceId: string;
  readonly grants: readonly CapabilityGrantRecord[];
  readonly capabilities: readonly string[];
  readonly decision: 'allowed' | 'denied';
  readonly outcome: 'completed' | 'failed';
  readonly errorCode: PrimitiveErrorCode | null;
  readonly requestMetadata: Readonly<Record<string, string>>;
  readonly occurredAt: string;
}): Promise<void> {
  await input.repository.appendGovernanceEvents(
    input.capabilities.map((capability) => {
      const grant = input.grants.find((candidate) => candidate.capability === capability);
      return {
        traceId: input.traceId,
        eventType: 'primitive.authorization',
        institutionId: input.session.institutionId,
        lmsConnectionId: input.session.lmsConnectionId,
        lmsContextId: input.session.lmsContextId,
        appInstallationId: input.session.appInstallationId,
        appId: input.session.appId,
        packageVersionId: input.session.packageVersionId,
        runtimeSessionId: input.session.runtimeSessionId,
        actorType: input.session.actorType,
        actorId: input.session.actorSubjectId,
        capability,
        capabilityGrantId: grant?.id ?? null,
        decision: input.decision,
        outcome: input.outcome,
        connectorKind: input.session.connectorKind,
        objectCount: null,
        latencyMs: null,
        errorCode: input.errorCode,
        requestMetadata: input.requestMetadata,
        occurredAt: input.occurredAt,
      };
    }),
  );
}

async function recordCompletion(input: {
  readonly repository: LmsKernelRepository;
  readonly session: GovernedRuntimeSession;
  readonly traceId: string;
  readonly outcome: 'completed' | 'failed' | 'limited';
  readonly objectCount: number | null;
  readonly latencyMs: number | null;
  readonly errorCode: PrimitiveErrorCode | null;
  readonly occurredAt: string;
}): Promise<void> {
  await input.repository.appendGovernanceEvent({
    traceId: input.traceId,
    eventType: 'primitive.roster.list',
    institutionId: input.session.institutionId,
    lmsConnectionId: input.session.lmsConnectionId,
    lmsContextId: input.session.lmsContextId,
    appInstallationId: input.session.appInstallationId,
    appId: input.session.appId,
    packageVersionId: input.session.packageVersionId,
    runtimeSessionId: input.session.runtimeSessionId,
    actorType: 'app',
    actorId: input.session.appId,
    capability: 'lms.roster.members.read',
    capabilityGrantId: null,
    decision: 'allowed',
    outcome: input.outcome,
    connectorKind: input.session.connectorKind,
    objectCount: input.objectCount,
    latencyMs: input.latencyMs,
    errorCode: input.errorCode,
    requestMetadata: {},
    occurredAt: input.occurredAt,
  });
}

function primitiveFailure(code: PrimitiveErrorCode, traceId: string): PrimitiveResult<never> {
  return { ok: false, error: { code, traceId } };
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
