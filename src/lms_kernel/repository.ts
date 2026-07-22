import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  ConnectorKind,
  GovernanceEventFilter,
  GovernanceEventRecord,
  GovernedRuntimeSession,
  GovernedRuntimeSessionWrite,
  InstitutionMembershipRecord,
  InstitutionRecord,
  InstitutionRole,
  LmsConnectionRecord,
  LmsContextRecord,
  LmsPlatformType,
} from './types.ts';

export interface ProtectedMediaReference {
  readonly id: string;
  readonly traceId: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly lmsContextId: string;
  readonly runtimeSessionId: string;
  readonly appInstallationId: string;
  readonly packageVersionId: number;
  readonly subjectIdentityId: string;
  readonly actorSubjectId: string;
  readonly actorType: 'instructor' | 'administrator';
  readonly connectorKind: ConnectorKind;
  readonly sourceUrl: string;
  readonly expiresAt: string;
}

export interface RosterContinuation {
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly appInstallationId: string;
  readonly packageVersionId: number;
  readonly connectorKind: ConnectorKind;
  readonly continuationValue: string;
  readonly expiresAt: string;
}

export interface GovernedWrite {
  readonly event: Omit<GovernanceEventRecord, 'id'>;
}

export interface InstitutionRepository {
  createInstitutionWithOwner(
    input: GovernedWrite & {
      readonly id: string;
      readonly slug: string;
      readonly name: string;
      readonly ownerUserId: string;
      readonly now: string;
    },
  ): Promise<InstitutionRecord>;
  getInstitutionById(id: string): Promise<InstitutionRecord | null>;
  listMembershipsForUser(userId: string): Promise<InstitutionMembershipRecord[]>;
  getMembership(
    institutionId: string,
    userId: string,
  ): Promise<InstitutionMembershipRecord | null>;
  createInvite(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly tokenHash: string;
      readonly role: Exclude<InstitutionRole, 'owner'>;
      readonly createdByUserId: string;
      readonly createdAt: string;
      readonly expiresAt: string;
    },
  ): Promise<void>;
  acceptInvite(input: {
    readonly tokenHash: string;
    readonly userId: string;
    readonly acceptedAt: string;
    readonly traceId: string;
  }): Promise<InstitutionMembershipRecord | null>;
}

export interface LmsConnectionRepository {
  createLmsConnection(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly label: string;
      readonly platformType: LmsPlatformType;
      readonly issuer: string;
      readonly clientId: string;
      readonly deploymentId: string;
      readonly authorizationEndpoint: string;
      readonly accessTokenUrl: string;
      readonly jwksUrl: string;
      readonly now: string;
    },
  ): Promise<LmsConnectionRecord>;
  getLmsConnectionById(id: string): Promise<LmsConnectionRecord | null>;
  getLmsConnectionByPlatformIdentity(input: {
    readonly issuer: string;
    readonly clientId: string;
    readonly deploymentId: string;
  }): Promise<LmsConnectionRecord | null>;
  listLmsConnections(institutionId: string): Promise<LmsConnectionRecord[]>;
  activateLmsConnection(
    input: GovernedWrite & {
      readonly id: string;
      readonly validatedAt: string;
    },
  ): Promise<LmsConnectionRecord | null>;
  disableLmsConnection(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly disabledAt: string;
    },
  ): Promise<LmsConnectionRecord | null>;
  getOrCreateLmsContext(input: {
    readonly id: string;
    readonly institutionId: string;
    readonly lmsConnectionId: string;
    readonly providerContextId: string;
    readonly label: string | null;
    readonly now: string;
  }): Promise<LmsContextRecord>;
  getLmsContextById(id: string): Promise<LmsContextRecord | null>;
  listLmsContexts(institutionId: string): Promise<LmsContextRecord[]>;
}

export interface AppInstallationRepository {
  createInstallation(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly appId: string;
      readonly packageVersionId: number;
      readonly installedByUserId: string;
      readonly now: string;
    },
  ): Promise<AppInstallationRecord>;
  replaceInstallationPackageVersion(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly packageVersionId: number;
      readonly installedByUserId: string;
      readonly now: string;
    },
  ): Promise<AppInstallationRecord | null>;
  getInstallationById(id: string): Promise<AppInstallationRecord | null>;
  listInstallations(institutionId: string): Promise<AppInstallationRecord[]>;
  activateInstallation(
    input: GovernedWrite & {
      readonly id: string;
      readonly activatedAt: string;
    },
  ): Promise<AppInstallationRecord | null>;
  disableInstallation(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly disabledAt: string;
    },
  ): Promise<AppInstallationRecord | null>;
  createCapabilityGrant(
    input: GovernedWrite & {
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
    },
  ): Promise<CapabilityGrantRecord>;
  revokeCapabilityGrant(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly revokedByUserId: string;
      readonly revokedAt: string;
    },
  ): Promise<CapabilityGrantRecord | null>;
  listCapabilityGrants(appInstallationId: string): Promise<CapabilityGrantRecord[]>;
  listCapabilityGrantsForInstitution(institutionId: string): Promise<CapabilityGrantRecord[]>;
}

export interface GovernedRuntimeRepository {
  getGovernedRuntimeSession(input: {
    readonly runtimeSessionId: string;
    readonly runtimeSessionToken: string;
  }): Promise<GovernedRuntimeSession | null>;
  createGovernedRuntimeSession(
    input: GovernedWrite & {
      readonly session: GovernedRuntimeSessionWrite;
      readonly createdAt: string;
    },
  ): Promise<GovernedRuntimeSession>;
  getOrCreateSubjectIdentity(input: {
    readonly id: string;
    readonly institutionId: string;
    readonly lmsConnectionId: string;
    readonly providerSubjectId: string;
    readonly now: string;
  }): Promise<string>;
  saveRosterContinuation(input: RosterContinuation): Promise<void>;
  getRosterContinuation(id: string): Promise<RosterContinuation | null>;
  saveProtectedMediaReference(input: ProtectedMediaReference): Promise<void>;
  getAuthorizedProtectedMediaReference(input: {
    readonly id: string;
    readonly now: string;
  }): Promise<ProtectedMediaReference | null>;
}

export interface GovernanceEventRepository {
  appendGovernanceEvents(
    events: readonly Omit<GovernanceEventRecord, 'id'>[],
  ): Promise<void>;
  appendGovernanceEvent(
    event: Omit<GovernanceEventRecord, 'id'>,
  ): Promise<GovernanceEventRecord>;
  listGovernanceEvents(filter: GovernanceEventFilter): Promise<GovernanceEventRecord[]>;
}

export type LmsKernelRepository =
  & InstitutionRepository
  & LmsConnectionRepository
  & AppInstallationRepository
  & GovernedRuntimeRepository
  & GovernanceEventRepository;
