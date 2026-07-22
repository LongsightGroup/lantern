import type { ConnectorKind, GovernanceEventRecord } from './types.ts';

export type GovernanceEventInput = Omit<GovernanceEventRecord, 'id'>;

type RequiredKeys = 'traceId' | 'eventType' | 'actorType' | 'outcome' | 'occurredAt';

export type GovernanceEventBaseInput =
  & Pick<GovernanceEventInput, RequiredKeys>
  & Partial<Omit<GovernanceEventInput, RequiredKeys>>;

export function governanceEventBase(input: GovernanceEventBaseInput): GovernanceEventInput {
  return {
    traceId: input.traceId,
    eventType: input.eventType,
    institutionId: input.institutionId ?? null,
    lmsConnectionId: input.lmsConnectionId ?? null,
    lmsContextId: input.lmsContextId ?? null,
    appInstallationId: input.appInstallationId ?? null,
    appId: input.appId ?? null,
    packageVersionId: input.packageVersionId ?? null,
    runtimeSessionId: input.runtimeSessionId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    capability: input.capability ?? null,
    capabilityGrantId: input.capabilityGrantId ?? null,
    decision: input.decision ?? null,
    outcome: input.outcome,
    connectorKind: input.connectorKind ?? null,
    objectCount: input.objectCount ?? null,
    latencyMs: input.latencyMs ?? null,
    errorCode: input.errorCode ?? null,
    requestMetadata: input.requestMetadata ?? {},
    occurredAt: input.occurredAt,
  };
}

export function adminGovernanceEvent(input: {
  readonly traceId: string;
  readonly eventType: string;
  readonly institutionId: string;
  readonly lmsConnectionId?: string | null;
  readonly lmsContextId?: string | null;
  readonly appInstallationId?: string | null;
  readonly appId?: string | null;
  readonly packageVersionId?: number | null;
  readonly runtimeSessionId?: string | null;
  readonly actorId: string;
  readonly capability?: string | null;
  readonly capabilityGrantId?: string | null;
  readonly occurredAt: string;
}): GovernanceEventInput {
  return governanceEventBase({
    ...input,
    actorType: 'user',
    decision: 'allowed',
    outcome: 'completed',
  });
}

export function launchAcceptedEvent(input: {
  readonly traceId: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly lmsContextId: string;
  readonly appInstallationId: string;
  readonly appId: string;
  readonly packageVersionId: number;
  readonly runtimeSessionId: string;
  readonly actorId: string;
  readonly actorType: 'instructor' | 'administrator';
  readonly connectorKind: ConnectorKind;
  readonly occurredAt: string;
  readonly requestMetadata?: Readonly<Record<string, string>>;
}): GovernanceEventInput {
  return governanceEventBase({
    ...input,
    eventType: 'launch.accepted',
    decision: 'allowed',
    outcome: 'completed',
  });
}

export function launchDeniedEvent(input: {
  readonly traceId: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly errorCode: string;
  readonly occurredAt: string;
  readonly requestMetadata?: Readonly<Record<string, string>>;
}): GovernanceEventInput {
  return governanceEventBase({
    ...input,
    eventType: 'launch.denied',
    actorType: 'system',
    decision: 'denied',
    outcome: 'failed',
    connectorKind: 'nrps',
  });
}

export function connectionValidatedEvent(input: {
  readonly traceId: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly lmsContextId?: string | null;
  readonly appInstallationId?: string | null;
  readonly appId?: string | null;
  readonly packageVersionId?: number | null;
  readonly occurredAt: string;
}): GovernanceEventInput {
  return governanceEventBase({
    ...input,
    eventType: 'lms_connection.validated',
    actorType: 'system',
    decision: 'allowed',
    outcome: 'completed',
    connectorKind: 'nrps',
  });
}

export function runtimeResponseEvent(input: {
  readonly traceId: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly lmsContextId: string;
  readonly appInstallationId: string;
  readonly appId: string;
  readonly packageVersionId: number;
  readonly runtimeSessionId: string;
  readonly actorType: GovernanceEventInput['actorType'];
  readonly actorId: string;
  readonly outcome: GovernanceEventInput['outcome'];
  readonly connectorKind: ConnectorKind;
  readonly errorCode?: string | null;
  readonly occurredAt: string;
}): GovernanceEventInput {
  return governanceEventBase({
    ...input,
    eventType: 'runtime.response',
    decision: input.outcome === 'completed' ? 'allowed' : 'denied',
  });
}
