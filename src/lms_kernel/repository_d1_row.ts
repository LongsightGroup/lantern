import { requireRosterCapability as requireCapability } from './capabilities.ts';
import { parseJsonObject, parseStringArray } from './parsing.ts';
import type { ProtectedMediaReference, RosterContinuation } from './repository.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  GovernanceEventRecord,
  GovernedRuntimeSession,
  InstitutionMembershipRecord,
  InstitutionRecord,
  LmsConnectionRecord,
  LmsContextRecord,
} from './types.ts';

export type D1Row = Record<string, unknown>;

export function requireString(row: D1Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

export function optionalString(row: D1Row, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string or null.`);
  }
  return value;
}

export function requireInteger(row: D1Row, field: string): number {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${field} must be an integer.`);
  }
  return value;
}

export function optionalInteger(row: D1Row, field: string): number | null {
  const value = row[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${field} must be an integer or null.`);
  }
  return value;
}

export function requireEnum<const T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${field} used an unsupported value.`);
  }
  return value as T;
}

export function nullableEnum<const T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T | null {
  return value === null || value === undefined ? null : requireEnum(value, values, field);
}

export function parseJson(value: unknown, field: string): unknown {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be JSON text.`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${field} must contain valid JSON.`);
  }
}

export function requireMembershipRole(value: unknown): InstitutionMembershipRecord['role'] {
  return requireEnum(value, ['owner', 'admin', 'auditor'], 'institution_memberships.role');
}

export function requireRosterCapability(value: unknown): CapabilityGrantRecord['capability'] {
  return requireCapability(value, 'capability_grants.capability');
}

export function addOptionalClause(
  clauses: string[],
  parameters: unknown[],
  column: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    clauses.push(`${column} = ?`);
    parameters.push(value);
  }
}

export function mapInstitution(row: D1Row): InstitutionRecord {
  return {
    id: requireString(row, 'id'),
    slug: requireString(row, 'slug'),
    name: requireString(row, 'name'),
    status: requireEnum(row.status, ['active', 'disabled'], 'institutions.status'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
  };
}

export function mapMembership(row: D1Row): InstitutionMembershipRecord {
  return {
    institutionId: requireString(row, 'institution_id'),
    userId: requireString(row, 'user_id'),
    role: requireMembershipRole(row.role),
    createdAt: requireString(row, 'created_at'),
  };
}

export function mapConnection(row: D1Row): LmsConnectionRecord {
  return {
    id: requireString(row, 'id'),
    institutionId: requireString(row, 'institution_id'),
    label: requireString(row, 'label'),
    platformType: requireEnum(
      row.platform_type,
      ['canvas', 'moodle', 'brightspace', 'sakai', 'synthetic'],
      'lms_connections.platform_type',
    ),
    issuer: requireString(row, 'issuer'),
    clientId: requireString(row, 'client_id'),
    deploymentId: requireString(row, 'deployment_id'),
    authorizationEndpoint: requireString(row, 'authorization_endpoint'),
    accessTokenUrl: requireString(row, 'access_token_url'),
    jwksUrl: requireString(row, 'jwks_url'),
    status: requireEnum(
      row.status,
      ['pending', 'active', 'disabled'],
      'lms_connections.status',
    ),
    validatedAt: optionalString(row, 'validated_at'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
  };
}

export function mapLmsContext(row: D1Row): LmsContextRecord {
  return {
    id: requireString(row, 'id'),
    institutionId: requireString(row, 'institution_id'),
    lmsConnectionId: requireString(row, 'lms_connection_id'),
    providerContextId: requireString(row, 'provider_context_id'),
    label: optionalString(row, 'label'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
  };
}

export function mapInstallation(row: D1Row): AppInstallationRecord {
  return {
    id: requireString(row, 'id'),
    institutionId: requireString(row, 'institution_id'),
    appId: requireString(row, 'app_id'),
    packageVersionId: requireInteger(row, 'package_version_id'),
    status: requireEnum(
      row.status,
      ['pending_approval', 'active', 'disabled'],
      'app_installations.status',
    ),
    installedByUserId: requireString(row, 'installed_by_user_id'),
    installedAt: requireString(row, 'installed_at'),
    activatedAt: optionalString(row, 'activated_at'),
    updatedAt: requireString(row, 'updated_at'),
  };
}

export function mapCapabilityGrant(row: D1Row): CapabilityGrantRecord {
  const scopeKind = requireEnum(
    row.scope_kind,
    ['institution', 'context'],
    'capability_grants.scope_kind',
  );
  const contextId = optionalString(row, 'lms_context_id');
  if (scopeKind === 'context' && contextId === null) {
    throw new Error('Context capability grant is missing lms_context_id.');
  }

  return {
    id: requireString(row, 'id'),
    institutionId: requireString(row, 'institution_id'),
    appInstallationId: requireString(row, 'app_installation_id'),
    packageVersionId: requireInteger(row, 'package_version_id'),
    capability: requireRosterCapability(row.capability),
    scope: scopeKind === 'institution'
      ? { kind: 'institution' }
      : { kind: 'context', lmsContextId: contextId! },
    approvedByUserId: requireString(row, 'approved_by_user_id'),
    approvedAt: requireString(row, 'approved_at'),
    revokedByUserId: optionalString(row, 'revoked_by_user_id'),
    revokedAt: optionalString(row, 'revoked_at'),
  };
}

export function mapGovernedRuntimeSession(row: D1Row): GovernedRuntimeSession {
  return {
    runtimeSessionId: requireString(row, 'runtime_session_id'),
    runtimeSessionToken: requireString(row, 'runtime_session_token'),
    launchTraceId: requireString(row, 'launch_trace_id'),
    runtimeExpiresAt: requireString(row, 'runtime_expires_at'),
    institutionId: requireString(row, 'institution_id'),
    lmsConnectionId: requireString(row, 'lms_connection_id'),
    lmsContextId: requireString(row, 'lms_context_id'),
    appInstallationId: requireString(row, 'app_installation_id'),
    appId: requireString(row, 'app_id'),
    packageVersionId: requireInteger(row, 'package_version_id'),
    packageVersion: requireString(row, 'package_version'),
    packageCapabilities: parseStringArray(
      parseJson(row.package_capabilities, 'governed_runtime_sessions.package_capabilities'),
      'governed_runtime_sessions.package_capabilities',
    ),
    actorSubjectId: requireString(row, 'actor_subject_id'),
    actorType: requireEnum(
      row.actor_type,
      ['instructor', 'administrator'],
      'governed_runtime_sessions.actor_type',
    ),
    ltiToolSessionId: optionalString(row, 'lti_tool_session_id'),
    nrpsContextMembershipsUrl: optionalString(row, 'nrps_context_memberships_url'),
    nrpsServiceVersions: parseStringArray(
      parseJson(row.nrps_service_versions, 'runtime_sessions.nrps_service_versions'),
      'runtime_sessions.nrps_service_versions',
    ),
    connectionStatus: requireEnum(
      row.connection_status,
      ['pending', 'active', 'disabled'],
      'lms_connections.status',
    ),
    institutionStatus: requireEnum(
      row.institution_status,
      ['active', 'disabled'],
      'institutions.status',
    ),
    installationStatus: requireEnum(
      row.installation_status,
      ['pending_approval', 'active', 'disabled'],
      'app_installations.status',
    ),
    connectorKind: requireEnum(
      row.connector_kind,
      ['nrps', 'synthetic'],
      'governed_runtime_sessions.connector_kind',
    ),
  };
}

export function mapContinuation(row: D1Row): RosterContinuation {
  return {
    id: requireString(row, 'id'),
    runtimeSessionId: requireString(row, 'runtime_session_id'),
    appInstallationId: requireString(row, 'app_installation_id'),
    packageVersionId: requireInteger(row, 'package_version_id'),
    connectorKind: requireEnum(
      row.connector_kind,
      ['nrps', 'synthetic'],
      'roster_continuations.connector_kind',
    ),
    continuationValue: requireString(row, 'continuation_value'),
    expiresAt: requireString(row, 'expires_at'),
  };
}

export function mapProtectedMediaReference(row: D1Row): ProtectedMediaReference {
  return {
    id: requireString(row, 'id'),
    traceId: requireString(row, 'trace_id'),
    institutionId: requireString(row, 'institution_id'),
    lmsConnectionId: requireString(row, 'lms_connection_id'),
    lmsContextId: requireString(row, 'lms_context_id'),
    runtimeSessionId: requireString(row, 'runtime_session_id'),
    appInstallationId: requireString(row, 'app_installation_id'),
    packageVersionId: requireInteger(row, 'package_version_id'),
    subjectIdentityId: requireString(row, 'subject_identity_id'),
    actorSubjectId: requireString(row, 'actor_subject_id'),
    actorType: requireEnum(
      row.actor_type,
      ['instructor', 'administrator'],
      'protected_media_refs.actor_type',
    ),
    connectorKind: requireEnum(
      row.connector_kind,
      ['nrps', 'synthetic'],
      'protected_media_refs.connector_kind',
    ),
    sourceUrl: requireString(row, 'source_url'),
    expiresAt: requireString(row, 'expires_at'),
  };
}

export function mapGovernanceEvent(row: D1Row): GovernanceEventRecord {
  return {
    id: requireInteger(row, 'id'),
    traceId: requireString(row, 'trace_id'),
    eventType: requireString(row, 'event_type'),
    institutionId: optionalString(row, 'institution_id'),
    lmsConnectionId: optionalString(row, 'lms_connection_id'),
    lmsContextId: optionalString(row, 'lms_context_id'),
    appInstallationId: optionalString(row, 'app_installation_id'),
    appId: optionalString(row, 'app_id'),
    packageVersionId: optionalInteger(row, 'package_version_id'),
    runtimeSessionId: optionalString(row, 'runtime_session_id'),
    actorType: requireEnum(
      row.actor_type,
      ['user', 'instructor', 'administrator', 'system', 'app'],
      'governance_events.actor_type',
    ),
    actorId: optionalString(row, 'actor_id'),
    capability: optionalString(row, 'capability'),
    capabilityGrantId: optionalString(row, 'capability_grant_id'),
    decision: nullableEnum(row.decision, ['allowed', 'denied'], 'governance_events.decision'),
    outcome: requireEnum(
      row.outcome,
      ['completed', 'failed', 'limited'],
      'governance_events.outcome',
    ),
    connectorKind: nullableEnum(
      row.connector_kind,
      ['nrps', 'synthetic'],
      'governance_events.connector_kind',
    ),
    objectCount: optionalInteger(row, 'object_count'),
    latencyMs: optionalInteger(row, 'latency_ms'),
    errorCode: optionalString(row, 'error_code'),
    requestMetadata: parseJsonObject(
      parseJson(row.request_metadata, 'governance_events.request_metadata'),
      'governance_events.request_metadata',
    ),
    occurredAt: requireString(row, 'occurred_at'),
  };
}

export function requireInstitution(
  value: InstitutionRecord | null,
  id: string,
): InstitutionRecord {
  if (value === null) {
    throw new Error(`Institution ${id} was not found after persistence.`);
  }
  return value;
}

export function requireConnection(
  value: LmsConnectionRecord | null,
  id: string,
): LmsConnectionRecord {
  if (value === null) {
    throw new Error(`LMS connection ${id} was not found after persistence.`);
  }
  return value;
}

export function requireInstallation(
  value: AppInstallationRecord | null,
  id: string,
): AppInstallationRecord {
  if (value === null) {
    throw new Error(`App installation ${id} was not found after persistence.`);
  }
  return value;
}
