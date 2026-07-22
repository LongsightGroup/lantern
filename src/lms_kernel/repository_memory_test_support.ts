import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';
import type {
  GovernedWrite,
  LmsKernelRepository,
  ProtectedMediaReference,
  RosterContinuation,
} from './repository.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  GovernanceEventFilter,
  GovernanceEventRecord,
  GovernedRuntimeSession,
  GovernedRuntimeSessionWrite,
  InstitutionMembershipRecord,
  InstitutionRecord,
  LmsConnectionRecord,
  LmsContextRecord,
} from './types.ts';

export class MemoryLmsKernelRepository implements LmsKernelRepository {
  readonly grants: CapabilityGrantRecord[];
  readonly events: GovernanceEventRecord[] = [];
  readonly continuations = new Map<string, RosterContinuation>();
  readonly media = new Map<string, ProtectedMediaReference>();
  readonly subjectIds = new Map<string, string>();
  session: GovernedRuntimeSession | null;

  constructor(input: {
    readonly session: GovernedRuntimeSession;
    readonly grants: readonly CapabilityGrantRecord[];
  }) {
    this.session = input.session;
    this.grants = [...input.grants];
  }

  createInstitutionWithOwner(): Promise<InstitutionRecord> {
    return unsupported();
  }

  getInstitutionById(): Promise<InstitutionRecord | null> {
    return unsupported();
  }

  listMembershipsForUser(): Promise<InstitutionMembershipRecord[]> {
    return unsupported();
  }

  getMembership(): Promise<InstitutionMembershipRecord | null> {
    return unsupported();
  }

  createInvite(): Promise<void> {
    return unsupported();
  }

  acceptInvite(): Promise<InstitutionMembershipRecord | null> {
    return unsupported();
  }

  createLmsConnection(): Promise<LmsConnectionRecord> {
    return unsupported();
  }

  getLmsConnectionById(): Promise<LmsConnectionRecord | null> {
    return unsupported();
  }

  getLmsConnectionByPlatformIdentity(): Promise<LmsConnectionRecord | null> {
    return unsupported();
  }

  listLmsConnections(): Promise<LmsConnectionRecord[]> {
    return unsupported();
  }

  activateLmsConnection(): Promise<LmsConnectionRecord | null> {
    return unsupported();
  }

  disableLmsConnection(): Promise<LmsConnectionRecord | null> {
    return unsupported();
  }

  getOrCreateLmsContext(): Promise<LmsContextRecord> {
    return unsupported();
  }

  getLmsContextById(_id: string): Promise<LmsContextRecord | null> {
    return unsupported();
  }

  listLmsContexts(): Promise<LmsContextRecord[]> {
    return unsupported();
  }

  createInstallation(_input: {
    readonly id: string;
    readonly institutionId: string;
    readonly appId: string;
    readonly packageVersionId: number;
    readonly installedByUserId: string;
    readonly now: string;
  }): Promise<AppInstallationRecord> {
    return unsupported();
  }

  replaceInstallationPackageVersion(_input: {
    readonly id: string;
    readonly institutionId: string;
    readonly packageVersionId: number;
    readonly installedByUserId: string;
    readonly now: string;
  }): Promise<AppInstallationRecord | null> {
    return unsupported();
  }

  getInstallationById(_id: string): Promise<AppInstallationRecord | null> {
    return unsupported();
  }

  listInstallations(_institutionId: string): Promise<AppInstallationRecord[]> {
    return unsupported();
  }

  activateInstallation(_input: {
    readonly id: string;
    readonly activatedAt: string;
  }): Promise<AppInstallationRecord | null> {
    return unsupported();
  }

  disableInstallation(): Promise<AppInstallationRecord | null> {
    return unsupported();
  }

  createCapabilityGrant(_input: {
    readonly id: string;
    readonly institutionId: string;
    readonly appInstallationId: string;
    readonly packageVersionId: number;
    readonly capability: RosterCapability;
    readonly scope:
      | { readonly kind: 'institution' }
      | { readonly kind: 'context'; readonly lmsContextId: string };
    readonly approvedByUserId: string;
    readonly approvedAt: string;
  }): Promise<CapabilityGrantRecord> {
    return unsupported();
  }

  revokeCapabilityGrant(input: {
    readonly id: string;
    readonly institutionId: string;
    readonly revokedByUserId: string;
    readonly revokedAt: string;
  }): Promise<CapabilityGrantRecord | null> {
    const index = this.grants.findIndex((grant) =>
      grant.id === input.id && grant.institutionId === input.institutionId
    );
    if (index < 0) {
      return Promise.resolve(null);
    }
    const revoked = {
      ...this.grants[index]!,
      revokedByUserId: input.revokedByUserId,
      revokedAt: input.revokedAt,
    };
    this.grants[index] = revoked;
    return Promise.resolve(revoked);
  }

  listCapabilityGrants(appInstallationId: string): Promise<CapabilityGrantRecord[]> {
    return Promise.resolve(
      this.grants.filter((grant) => grant.appInstallationId === appInstallationId),
    );
  }

  listCapabilityGrantsForInstitution(institutionId: string): Promise<CapabilityGrantRecord[]> {
    return Promise.resolve(
      this.grants.filter((grant) => grant.institutionId === institutionId),
    );
  }

  getGovernedRuntimeSession(input: {
    readonly runtimeSessionId: string;
    readonly runtimeSessionToken: string;
  }): Promise<GovernedRuntimeSession | null> {
    if (
      this.session === null ||
      input.runtimeSessionId !== this.session.runtimeSessionId ||
      input.runtimeSessionToken !== this.session.runtimeSessionToken
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.session);
  }

  createGovernedRuntimeSession(
    input: GovernedWrite & {
      readonly session: GovernedRuntimeSessionWrite;
      readonly createdAt: string;
    },
  ): Promise<GovernedRuntimeSession> {
    const session: GovernedRuntimeSession = {
      ...input.session,
      connectionStatus: 'active',
      institutionStatus: 'active',
      installationStatus: 'active',
    };
    this.session = session;
    this.recordGovernanceEvent(input.event);
    return Promise.resolve(session);
  }

  getOrCreateSubjectIdentity(input: {
    readonly id: string;
    readonly institutionId: string;
    readonly lmsConnectionId: string;
    readonly providerSubjectId: string;
    readonly now: string;
  }): Promise<string> {
    const key = `${input.lmsConnectionId}:${input.providerSubjectId}`;
    const existing = this.subjectIds.get(key);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    this.subjectIds.set(key, input.id);
    return Promise.resolve(input.id);
  }

  saveRosterContinuation(input: RosterContinuation): Promise<void> {
    this.continuations.set(input.id, input);
    return Promise.resolve();
  }

  getRosterContinuation(id: string): Promise<RosterContinuation | null> {
    return Promise.resolve(this.continuations.get(id) ?? null);
  }

  saveProtectedMediaReference(input: ProtectedMediaReference): Promise<void> {
    this.media.set(input.id, input);
    return Promise.resolve();
  }

  getAuthorizedProtectedMediaReference(input: {
    readonly id: string;
    readonly now: string;
  }): Promise<ProtectedMediaReference | null> {
    const reference = this.media.get(input.id);
    const photoGrant = this.grants.find((grant) =>
      grant.capability === 'lms.roster.profile_photo.read' &&
      grant.revokedAt === null
    );
    if (
      reference === undefined ||
      Date.parse(reference.expiresAt) <= Date.parse(input.now) ||
      photoGrant === undefined
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(reference);
  }

  appendGovernanceEvent(
    event: Omit<GovernanceEventRecord, 'id'>,
  ): Promise<GovernanceEventRecord> {
    return Promise.resolve(this.recordGovernanceEvent(event));
  }

  appendGovernanceEvents(
    events: readonly Omit<GovernanceEventRecord, 'id'>[],
  ): Promise<void> {
    for (const event of events) this.recordGovernanceEvent(event);
    return Promise.resolve();
  }

  listGovernanceEvents(filter: GovernanceEventFilter): Promise<GovernanceEventRecord[]> {
    return Promise.resolve(
      this.events.filter((event) =>
        event.institutionId === filter.institutionId &&
        (filter.traceId === undefined || event.traceId === filter.traceId) &&
        (filter.capability === undefined || event.capability === filter.capability) &&
        (filter.decision === undefined || event.decision === filter.decision) &&
        (filter.outcome === undefined || event.outcome === filter.outcome)
      ),
    );
  }

  protected recordGovernanceEvent(
    event: Omit<GovernanceEventRecord, 'id'>,
  ): GovernanceEventRecord {
    const record = { id: this.events.length + 1, ...event };
    this.events.push(record);
    return record;
  }
}

export function buildKernelGrant(
  id: string,
  capability: RosterCapability,
): CapabilityGrantRecord {
  return {
    id,
    institutionId: 'institution-1',
    appInstallationId: 'installation-1',
    packageVersionId: 1,
    capability,
    scope: { kind: 'context', lmsContextId: 'context-1' },
    approvedByUserId: 'admin-1',
    approvedAt: '2026-07-19T15:00:00.000Z',
    revokedByUserId: null,
    revokedAt: null,
  };
}

export function buildGovernedSyntheticSession(): GovernedRuntimeSession {
  return {
    runtimeSessionId: 'runtime-1',
    runtimeSessionToken: 'runtime-token',
    launchTraceId: 'trace-1',
    runtimeExpiresAt: '2026-07-19T17:00:00.000Z',
    institutionId: 'institution-1',
    lmsConnectionId: 'connection-1',
    lmsContextId: 'context-1',
    appInstallationId: 'installation-1',
    appId: 'photo-roster',
    packageVersionId: 1,
    packageVersion: '0.1.0',
    packageCapabilities: [
      'lms.roster.members.read',
      'lms.roster.contact.read',
      'lms.roster.profile_photo.read',
    ],
    actorSubjectId: 'instructor-1',
    actorType: 'instructor',
    ltiToolSessionId: null,
    nrpsContextMembershipsUrl: null,
    nrpsServiceVersions: [],
    connectionStatus: 'active',
    institutionStatus: 'active',
    installationStatus: 'active',
    connectorKind: 'synthetic',
  };
}

function unsupported<T>(): Promise<T> {
  return Promise.reject(new Error('This repository operation is outside the test seam.'));
}
