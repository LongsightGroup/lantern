import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  InstitutionMembershipRecord,
} from './types.ts';
import { failure, type KernelAdminResult } from './admin_result.ts';
import { canGovern, type KernelAdminDeps } from './admin_support.ts';
import { isRosterCapability } from './capabilities.ts';
import { adminGovernanceEvent } from './governance_events.ts';
import { mintGovernedRuntimeSession } from './launch_service.ts';

export function installApp(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly packageVersionId: number;
  },
): Promise<KernelAdminResult<AppInstallationRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure('permission_denied', 'Only institution owners and admins can install apps.');
    }
    const packageVersion = await deps.packageRepository.getPackageVersionById(
      command.packageVersionId,
    );
    if (packageVersion === null || packageVersion.approvalStatus !== 'approved') {
      return failure('not_found', 'Only an approved package version can be installed.');
    }
    if (
      packageVersion.runtime.kind !== 'worker' ||
      packageVersion.capabilities.some((capability) => !isRosterCapability(capability))
    ) {
      return failure(
        'invalid_request',
        'Governed LMS installations currently require a reviewed Worker app using roster capabilities only.',
      );
    }
    const installedAt = deps.now().toISOString();
    const existing = (
      await deps.repository.listInstallations(command.membership.institutionId)
    ).find((installation) => installation.appId === packageVersion.appId);
    const installationId = existing?.id ?? deps.createId();
    const event = adminGovernanceEvent({
      traceId: deps.createId(),
      eventType:
        existing === undefined ? 'app_installation.created' : 'app_installation.version_replaced',
      institutionId: command.membership.institutionId,
      appInstallationId: installationId,
      appId: packageVersion.appId,
      packageVersionId: packageVersion.id,
      actorId: command.membership.userId,
      occurredAt: installedAt,
    });
    const installation =
      existing === undefined
        ? await deps.repository.createInstallation({
            id: installationId,
            institutionId: command.membership.institutionId,
            appId: packageVersion.appId,
            packageVersionId: packageVersion.id,
            installedByUserId: command.membership.userId,
            now: installedAt,
            event,
          })
        : await deps.repository.replaceInstallationPackageVersion({
            id: existing.id,
            institutionId: command.membership.institutionId,
            packageVersionId: packageVersion.id,
            installedByUserId: command.membership.userId,
            now: installedAt,
            event,
          });
    if (installation === null) {
      return failure('not_found', 'App installation was not found.');
    }
    return { ok: true, value: installation };
  })();
}

export function grantCapability(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
    readonly capability: RosterCapability;
    readonly lmsContextId: string | null;
  },
): Promise<KernelAdminResult<CapabilityGrantRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure(
        'permission_denied',
        'Only institution owners and admins can approve data access.',
      );
    }
    const installation = await deps.repository.getInstallationById(command.installationId);
    if (installation === null || installation.institutionId !== command.membership.institutionId) {
      return failure('not_found', 'App installation was not found.');
    }
    const packageVersion = await deps.packageRepository.getPackageVersionById(
      installation.packageVersionId,
    );
    if (packageVersion === null || !packageVersion.capabilities.includes(command.capability)) {
      return failure(
        'invalid_request',
        'The reviewed app version did not request this capability.',
      );
    }
    if (command.lmsContextId !== null) {
      const context = await deps.repository.getLmsContextById(command.lmsContextId);
      if (context === null || context.institutionId !== command.membership.institutionId) {
        return failure('not_found', 'LMS context was not found.');
      }
    }
    const scopeKind = command.lmsContextId === null ? 'institution' : 'context';
    const existingGrant = (await deps.repository.listCapabilityGrants(installation.id)).find(
      (grant) =>
        grant.packageVersionId === installation.packageVersionId &&
        grant.capability === command.capability &&
        grant.scope.kind === scopeKind &&
        (grant.scope.kind === 'institution' || grant.scope.lmsContextId === command.lmsContextId),
    );
    const grantId = existingGrant?.id ?? deps.createId();
    const approvedAt = deps.now().toISOString();
    const grant = await deps.repository.createCapabilityGrant({
      id: grantId,
      institutionId: installation.institutionId,
      appInstallationId: installation.id,
      packageVersionId: installation.packageVersionId,
      capability: command.capability,
      scope:
        command.lmsContextId === null
          ? { kind: 'institution' }
          : { kind: 'context', lmsContextId: command.lmsContextId },
      approvedByUserId: command.membership.userId,
      approvedAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'capability_grant.approved',
        institutionId: installation.institutionId,
        appInstallationId: installation.id,
        appId: installation.appId,
        packageVersionId: installation.packageVersionId,
        actorId: command.membership.userId,
        capability: command.capability,
        capabilityGrantId: grantId,
        occurredAt: approvedAt,
      }),
    });
    return { ok: true, value: grant };
  })();
}

export function activateInstallation(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
  },
): Promise<KernelAdminResult<AppInstallationRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure('permission_denied', 'Only institution owners and admins can activate apps.');
    }
    const installation = await deps.repository.getInstallationById(command.installationId);
    if (installation === null || installation.institutionId !== command.membership.institutionId) {
      return failure('not_found', 'App installation was not found.');
    }
    const packageVersion = await deps.packageRepository.getPackageVersionById(
      installation.packageVersionId,
    );
    if (packageVersion === null) {
      return failure('not_found', 'Reviewed package version was not found.');
    }
    const required = packageVersion.capabilities.filter(isRosterCapability);
    const grants = await deps.repository.listCapabilityGrants(installation.id);
    const missing = required.filter(
      (capability) =>
        !grants.some(
          (grant) =>
            grant.capability === capability &&
            grant.packageVersionId === installation.packageVersionId &&
            grant.revokedAt === null,
        ),
    );
    if (missing.length > 0) {
      return failure(
        'approval_incomplete',
        `Approve every requested capability before activation: ${missing.join(', ')}.`,
      );
    }
    const activatedAt = deps.now().toISOString();
    const activated = await deps.repository.activateInstallation({
      id: installation.id,
      activatedAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'app_installation.activated',
        institutionId: installation.institutionId,
        appInstallationId: installation.id,
        appId: installation.appId,
        packageVersionId: installation.packageVersionId,
        actorId: command.membership.userId,
        occurredAt: activatedAt,
      }),
    });
    return activated === null
      ? failure('not_found', 'App installation was not found.')
      : { ok: true, value: activated };
  })();
}

export function revokeGrant(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly grantId: string;
  },
): Promise<KernelAdminResult<CapabilityGrantRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure('permission_denied', 'Only institution owners and admins can revoke access.');
    }
    const existingGrant = (
      await deps.repository.listCapabilityGrantsForInstitution(command.membership.institutionId)
    ).find((grant) => grant.id === command.grantId && grant.revokedAt === null);
    if (existingGrant === undefined) {
      return failure('not_found', 'Capability grant was not found.');
    }
    const revokedAt = deps.now().toISOString();
    const grant = await deps.repository.revokeCapabilityGrant({
      id: command.grantId,
      institutionId: command.membership.institutionId,
      revokedByUserId: command.membership.userId,
      revokedAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'capability_grant.revoked',
        institutionId: existingGrant.institutionId,
        appInstallationId: existingGrant.appInstallationId,
        packageVersionId: existingGrant.packageVersionId,
        actorId: command.membership.userId,
        capability: existingGrant.capability,
        capabilityGrantId: existingGrant.id,
        occurredAt: revokedAt,
      }),
    });
    if (grant === null) {
      return failure('not_found', 'Capability grant was not found.');
    }
    return { ok: true, value: grant };
  })();
}

export function createSyntheticLaunch(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
  },
): Promise<
  KernelAdminResult<{
    readonly runtimeSessionId: string;
    readonly runtimeSessionToken: string;
    readonly expiresAt: string;
  }>
> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure(
        'permission_denied',
        'Only institution owners and admins can create a synthetic launch.',
      );
    }
    const installation = await deps.repository.getInstallationById(command.installationId);
    if (
      installation === null ||
      installation.institutionId !== command.membership.institutionId ||
      installation.status !== 'active'
    ) {
      return failure('not_found', 'An active app installation was not found.');
    }
    const packageVersion = await deps.packageRepository.getPackageVersionById(
      installation.packageVersionId,
    );
    if (
      packageVersion === null ||
      packageVersion.approvalStatus !== 'approved' ||
      packageVersion.runtime.kind !== 'worker' ||
      packageVersion.appId !== installation.appId
    ) {
      return failure('not_found', 'The installation package is not runnable.');
    }
    const connection = (
      await deps.repository.listLmsConnections(command.membership.institutionId)
    ).find((item) => item.platformType === 'synthetic' && item.status === 'active');
    if (connection === undefined) {
      return failure('not_found', 'Create an active synthetic LMS connection first.');
    }
    const context = (await deps.repository.listLmsContexts(command.membership.institutionId)).find(
      (item) => item.lmsConnectionId === connection.id,
    );
    if (context === undefined) {
      return failure('not_found', 'The synthetic LMS context was not found.');
    }
    const minted = await mintGovernedRuntimeSession({
      repository: deps.repository,
      connection,
      installation,
      packageVersion: {
        appId: packageVersion.appId,
        id: packageVersion.id,
        version: packageVersion.version,
        capabilities: packageVersion.capabilities,
      },
      providerContextId: context.providerContextId,
      contextLabel: context.label,
      providerSubjectId: `synthetic-admin:${command.membership.userId}`,
      actorType: 'administrator',
      connectorKind: 'synthetic',
      ltiToolSessionId: null,
      nrpsContextMembershipsUrl: null,
      nrpsServiceVersions: [],
      createId: deps.createId,
      now: deps.now(),
    });
    return {
      ok: true,
      value: {
        runtimeSessionId: minted.runtimeSessionId,
        runtimeSessionToken: minted.runtimeSessionToken,
        expiresAt: minted.expiresAt,
      },
    };
  })();
}

export function disableInstallation(
  deps: KernelAdminDeps,
  command: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
  },
): Promise<KernelAdminResult<AppInstallationRecord>> {
  return (async () => {
    if (!canGovern(command.membership)) {
      return failure('permission_denied', 'Only institution owners and admins can disable apps.');
    }
    const existing = await deps.repository.getInstallationById(command.installationId);
    if (existing === null || existing.institutionId !== command.membership.institutionId) {
      return failure('not_found', 'App installation was not found.');
    }
    const disabledAt = deps.now().toISOString();
    const installation = await deps.repository.disableInstallation({
      id: command.installationId,
      institutionId: command.membership.institutionId,
      disabledAt,
      event: adminGovernanceEvent({
        traceId: deps.createId(),
        eventType: 'app_installation.disabled',
        institutionId: command.membership.institutionId,
        appInstallationId: command.installationId,
        appId: existing.appId,
        packageVersionId: existing.packageVersionId,
        actorId: command.membership.userId,
        occurredAt: disabledAt,
      }),
    });
    if (installation === null) {
      return failure('not_found', 'App installation was not found.');
    }
    return { ok: true, value: installation };
  })();
}
