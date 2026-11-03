import type { LmsKernelRepository } from './repository.ts';
import type { AppInstallationRecord, ConnectorKind, LmsConnectionRecord } from './types.ts';
import { connectionValidatedEvent, launchAcceptedEvent } from './governance_events.ts';
import { parseLtiContextRole } from './context_roles.ts';

/**
 * Governed launch service.
 *
 * This module owns the single trusted path that turns an authorized LMS launch
 * into a governed runtime session. All LMS launches (LTI resource links and
 * synthetic admin launches) mint sessions here so the boundary logic stays in
 * one place instead of being duplicated across routes and the admin service.
 */

export interface GovernedLaunchPackage {
  readonly appId: string;
  readonly id: number;
  readonly version: string;
  readonly capabilities: readonly string[];
}

export interface MintGovernedSessionInput {
  readonly repository: LmsKernelRepository;
  readonly connection: LmsConnectionRecord;
  readonly installation: AppInstallationRecord;
  readonly packageVersion: GovernedLaunchPackage;
  readonly providerContextId: string;
  readonly contextLabel: string | null;
  readonly providerSubjectId: string;
  readonly actorType: 'instructor' | 'administrator';
  readonly connectorKind: ConnectorKind;
  readonly ltiToolSessionId: string | null;
  readonly nrpsContextMembershipsUrl: string | null;
  readonly nrpsServiceVersions: readonly string[];
  readonly createId: () => string;
  readonly now?: Date;
  readonly traceId?: string;
}

export interface MintGovernedSessionResult {
  readonly runtimeSessionId: string;
  readonly runtimeSessionToken: string;
  readonly expiresAt: string;
  readonly launchTraceId: string;
}

const RUNTIME_SESSION_TTL_MS = 10 * 60 * 1000;

export function resolveGovernedLaunchActorType(
  roles: readonly string[],
): 'instructor' | 'administrator' | null {
  const contextRoles = roles.map(parseLtiContextRole);
  if (contextRoles.includes('administrator')) {
    return 'administrator';
  }
  if (contextRoles.includes('instructor')) {
    return 'instructor';
  }
  return null;
}

export async function mintGovernedRuntimeSession(
  input: MintGovernedSessionInput,
): Promise<MintGovernedSessionResult> {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const traceId = input.traceId ?? input.createId();
  const { repository, connection, installation, packageVersion } = input;

  if (connection.status !== 'active') {
    const activated = await repository.activateLmsConnection({
      id: connection.id,
      validatedAt: createdAt,
      event: connectionValidatedEvent({
        traceId,
        institutionId: connection.institutionId,
        lmsConnectionId: connection.id,
        appInstallationId: installation.id,
        appId: packageVersion.appId,
        packageVersionId: packageVersion.id,
        occurredAt: createdAt,
      }),
    });
    if (activated === null) {
      throw new Error('LMS connection could not be activated.');
    }
  }

  const lmsContext = await repository.getOrCreateLmsContext({
    id: input.createId(),
    institutionId: connection.institutionId,
    lmsConnectionId: connection.id,
    providerContextId: input.providerContextId,
    label: input.contextLabel,
    now: createdAt,
  });
  const actorSubjectId = await repository.getOrCreateSubjectIdentity({
    id: input.createId(),
    institutionId: connection.institutionId,
    lmsConnectionId: connection.id,
    providerSubjectId: input.providerSubjectId,
    now: createdAt,
  });
  const runtimeSessionId = input.createId();
  const runtimeSessionToken = input.createId();
  const expiresAt = new Date(now.getTime() + RUNTIME_SESSION_TTL_MS).toISOString();

  await repository.createGovernedRuntimeSession({
    session: {
      runtimeSessionId,
      runtimeSessionToken,
      launchTraceId: traceId,
      runtimeExpiresAt: expiresAt,
      institutionId: connection.institutionId,
      lmsConnectionId: connection.id,
      lmsContextId: lmsContext.id,
      appInstallationId: installation.id,
      appId: packageVersion.appId,
      packageVersionId: packageVersion.id,
      packageVersion: packageVersion.version,
      packageCapabilities: packageVersion.capabilities,
      actorSubjectId,
      actorType: input.actorType,
      ltiToolSessionId: input.ltiToolSessionId,
      nrpsContextMembershipsUrl: input.nrpsContextMembershipsUrl,
      nrpsServiceVersions: input.nrpsServiceVersions,
      connectorKind: input.connectorKind,
    },
    createdAt,
    event: launchAcceptedEvent({
      traceId,
      institutionId: connection.institutionId,
      lmsConnectionId: connection.id,
      lmsContextId: lmsContext.id,
      appInstallationId: installation.id,
      appId: packageVersion.appId,
      packageVersionId: packageVersion.id,
      runtimeSessionId,
      actorId: actorSubjectId,
      actorType: input.actorType,
      connectorKind: input.connectorKind,
      occurredAt: createdAt,
    }),
  });

  return { runtimeSessionId, runtimeSessionToken, expiresAt, launchTraceId: traceId };
}

export interface AcceptResourceLinkLaunchInput {
  readonly repository: LmsKernelRepository;
  readonly connection: LmsConnectionRecord;
  readonly installationId: string;
  readonly providerContextId: string;
  readonly contextLabel: string | null;
  readonly providerSubjectId: string;
  readonly roles: readonly string[];
  readonly ltiToolSessionId: string | null;
  readonly nrpsContextMembershipsUrl: string | null;
  readonly nrpsServiceVersions: readonly string[];
  readonly loadPackageVersion: (input: {
    readonly packageVersionId: number;
    readonly appId: string;
  }) => Promise<GovernedLaunchPackage | null>;
  readonly createId: () => string;
  readonly now?: Date;
  readonly traceId?: string;
}

export async function acceptResourceLinkLaunch(
  input: AcceptResourceLinkLaunchInput,
): Promise<MintGovernedSessionResult> {
  const installationId = input.installationId.trim();
  const installation =
    installationId === '' ? null : await input.repository.getInstallationById(installationId);
  if (
    installation === null ||
    installation.institutionId !== input.connection.institutionId ||
    installation.status !== 'active'
  ) {
    throw new Error('The governed app installation is not active for this LMS connection.');
  }
  const packageVersion = await input.loadPackageVersion({
    packageVersionId: installation.packageVersionId,
    appId: installation.appId,
  });
  if (packageVersion === null) {
    throw new Error('The governed app package is not runnable.');
  }
  const providerContextId = input.providerContextId.trim();
  if (providerContextId === '') {
    throw new Error('LTI launch context.id is required.');
  }
  const actorType = resolveGovernedLaunchActorType(input.roles);
  if (actorType === null) {
    throw new Error('Governed apps require an instructor or administrator launch role.');
  }
  const providerSubjectId = input.providerSubjectId.trim();
  if (providerSubjectId === '') {
    throw new Error('LTI launch subject is required.');
  }

  return await mintGovernedRuntimeSession({
    repository: input.repository,
    connection: input.connection,
    installation,
    packageVersion,
    providerContextId,
    contextLabel: input.contextLabel,
    providerSubjectId,
    actorType,
    connectorKind: 'nrps',
    ltiToolSessionId: input.ltiToolSessionId,
    nrpsContextMembershipsUrl: input.nrpsContextMembershipsUrl,
    nrpsServiceVersions: input.nrpsServiceVersions,
    createId: input.createId,
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
  });
}
