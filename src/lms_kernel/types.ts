import type { PrimitiveErrorCode, RosterCapability, RosterRole } from '../../sdk/worker-app-sdk.ts';

export type InstitutionRole = 'owner' | 'admin' | 'auditor';
export type LmsPlatformType = 'canvas' | 'moodle' | 'brightspace' | 'sakai' | 'synthetic';
export type ConnectorKind = 'nrps' | 'synthetic';
export type GrantScope =
  | { readonly kind: 'institution' }
  | { readonly kind: 'context'; readonly lmsContextId: string };

export interface InstitutionRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: 'active' | 'disabled';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InstitutionMembershipRecord {
  readonly institutionId: string;
  readonly userId: string;
  readonly role: InstitutionRole;
  readonly createdAt: string;
}

export interface LmsConnectionRecord {
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
  readonly status: 'pending' | 'active' | 'disabled';
  readonly validatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LmsContextRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly providerContextId: string;
  readonly label: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AppInstallationRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly appId: string;
  readonly packageVersionId: number;
  readonly status: 'pending_approval' | 'active' | 'disabled';
  readonly installedByUserId: string;
  readonly installedAt: string;
  readonly activatedAt: string | null;
  readonly updatedAt: string;
}

export interface CapabilityGrantRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly appInstallationId: string;
  readonly packageVersionId: number;
  readonly capability: RosterCapability;
  readonly scope: GrantScope;
  readonly approvedByUserId: string;
  readonly approvedAt: string;
  readonly revokedByUserId: string | null;
  readonly revokedAt: string | null;
}

export interface GovernedRuntimeSessionWrite {
  readonly runtimeSessionId: string;
  readonly runtimeSessionToken: string;
  readonly launchTraceId: string;
  readonly runtimeExpiresAt: string;
  readonly institutionId: string;
  readonly lmsConnectionId: string;
  readonly lmsContextId: string;
  readonly appInstallationId: string;
  readonly appId: string;
  readonly packageVersionId: number;
  readonly packageVersion: string;
  readonly packageCapabilities: readonly string[];
  readonly actorSubjectId: string;
  readonly actorType: 'instructor' | 'administrator';
  readonly ltiToolSessionId: string | null;
  readonly nrpsContextMembershipsUrl: string | null;
  readonly nrpsServiceVersions: readonly string[];
  readonly connectorKind: ConnectorKind;
}

export interface GovernedRuntimeSession extends GovernedRuntimeSessionWrite {
  readonly connectionStatus: LmsConnectionRecord['status'];
  readonly institutionStatus: InstitutionRecord['status'];
  readonly installationStatus: AppInstallationRecord['status'];
}

export interface RosterConnectorMember {
  readonly providerSubjectId: string;
  readonly displayName: string;
  readonly roles: readonly RosterRole[];
  readonly status: 'active' | 'inactive' | 'unknown';
  readonly email: string | null;
  readonly pictureUrl: string | null;
}

export interface RosterConnectorPage {
  readonly members: readonly RosterConnectorMember[];
  readonly nextContinuation: string | null;
}

export interface GovernanceEventRecord {
  readonly id: number;
  readonly traceId: string;
  readonly eventType: string;
  readonly institutionId: string | null;
  readonly lmsConnectionId: string | null;
  readonly lmsContextId: string | null;
  readonly appInstallationId: string | null;
  readonly appId: string | null;
  readonly packageVersionId: number | null;
  readonly runtimeSessionId: string | null;
  readonly actorType: 'user' | 'instructor' | 'administrator' | 'system' | 'app';
  readonly actorId: string | null;
  readonly capability: string | null;
  readonly capabilityGrantId: string | null;
  readonly decision: 'allowed' | 'denied' | null;
  readonly outcome: 'completed' | 'failed' | 'limited';
  readonly connectorKind: ConnectorKind | null;
  readonly objectCount: number | null;
  readonly latencyMs: number | null;
  readonly errorCode: PrimitiveErrorCode | string | null;
  readonly requestMetadata: Readonly<Record<string, string>>;
  readonly occurredAt: string;
}

export interface GovernanceEventFilter {
  readonly institutionId: string;
  readonly traceId?: string;
  readonly lmsConnectionId?: string;
  readonly appInstallationId?: string;
  readonly capability?: string;
  readonly decision?: 'allowed' | 'denied';
  readonly outcome?: 'completed' | 'failed' | 'limited';
  readonly occurredAfter?: string;
  readonly occurredBefore?: string;
  readonly limit?: number;
}
