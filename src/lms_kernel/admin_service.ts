import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';
import type { PackageReviewRepository } from '../package_review/repository.ts';
import type { LmsKernelRepository } from './repository.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  InstitutionMembershipRecord,
  InstitutionRecord,
  LmsConnectionRecord,
  LmsPlatformType,
} from './types.ts';
import type { KernelAdminResult } from './admin_result.ts';
import type { KernelAdminDeps } from './admin_support.ts';
import { acceptInvite, createInstitution, createInvite } from './admin_institution.ts';
import { createConnection, disableConnection } from './admin_connection.ts';
import {
  activateInstallation,
  createSyntheticLaunch,
  disableInstallation,
  grantCapability,
  installApp,
  revokeGrant,
} from './admin_installation.ts';

export type { KernelAdminFailureCode, KernelAdminResult } from './admin_result.ts';

export interface LmsKernelAdminService {
  createInstitution(input: {
    readonly userId: string;
    readonly name: string;
  }): Promise<KernelAdminResult<InstitutionRecord>>;
  createInvite(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly role: 'admin' | 'auditor';
  }): Promise<KernelAdminResult<{ readonly token: string; readonly expiresAt: string }>>;
  acceptInvite(input: {
    readonly userId: string;
    readonly token: string;
  }): Promise<KernelAdminResult<InstitutionMembershipRecord>>;
  createConnection(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly label: string;
    readonly platformType: LmsPlatformType;
    readonly lmsOrigin?: string;
    readonly issuer?: string;
    readonly clientId?: string;
    readonly deploymentId?: string;
    readonly authorizationEndpoint?: string;
    readonly accessTokenUrl?: string;
    readonly jwksUrl?: string;
  }): Promise<KernelAdminResult<LmsConnectionRecord>>;
  installApp(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly packageVersionId: number;
  }): Promise<KernelAdminResult<AppInstallationRecord>>;
  grantCapability(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
    readonly capability: RosterCapability;
    readonly lmsContextId: string | null;
  }): Promise<KernelAdminResult<CapabilityGrantRecord>>;
  activateInstallation(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
  }): Promise<KernelAdminResult<AppInstallationRecord>>;
  revokeGrant(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly grantId: string;
  }): Promise<KernelAdminResult<CapabilityGrantRecord>>;
  createSyntheticLaunch(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
  }): Promise<
    KernelAdminResult<{
      readonly runtimeSessionId: string;
      readonly runtimeSessionToken: string;
      readonly expiresAt: string;
    }>
  >;
  disableInstallation(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly installationId: string;
  }): Promise<KernelAdminResult<AppInstallationRecord>>;
  disableConnection(input: {
    readonly membership: InstitutionMembershipRecord;
    readonly connectionId: string;
  }): Promise<KernelAdminResult<LmsConnectionRecord>>;
}

export function createLmsKernelAdminService(input: {
  readonly repository: LmsKernelRepository;
  readonly packageRepository: PackageReviewRepository;
  readonly createId?: () => string;
  readonly createSecret?: () => string;
  readonly now?: () => Date;
  readonly syncLtiToolRegistration?: (connection: LmsConnectionRecord) => Promise<void>;
}): LmsKernelAdminService {
  const deps: KernelAdminDeps = {
    repository: input.repository,
    packageRepository: input.packageRepository,
    createId: input.createId ?? (() => crypto.randomUUID()),
    createSecret: input.createSecret ??
      (() => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')),
    now: input.now ?? (() => new Date()),
    ...(input.syncLtiToolRegistration === undefined
      ? {}
      : { syncLtiToolRegistration: input.syncLtiToolRegistration }),
  };

  return {
    createInstitution: (command) => createInstitution(deps, command),
    createInvite: (command) => createInvite(deps, command),
    acceptInvite: (command) => acceptInvite(deps, command),
    createConnection: (command) => createConnection(deps, command),
    installApp: (command) => installApp(deps, command),
    grantCapability: (command) => grantCapability(deps, command),
    activateInstallation: (command) => activateInstallation(deps, command),
    revokeGrant: (command) => revokeGrant(deps, command),
    createSyntheticLaunch: (command) => createSyntheticLaunch(deps, command),
    disableInstallation: (command) => disableInstallation(deps, command),
    disableConnection: (command) => disableConnection(deps, command),
  };
}
