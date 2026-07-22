import { assertEquals } from '@std/assert';
import type { RosterCapability } from '../../sdk/worker-app-sdk.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import { createLmsKernelAdminService } from './admin_service.ts';
import {
  buildGovernedSyntheticSession,
  MemoryLmsKernelRepository,
} from './repository_memory_test_support.ts';
import type { GovernedWrite } from './repository.ts';
import type {
  AppInstallationRecord,
  CapabilityGrantRecord,
  InstitutionMembershipRecord,
  LmsContextRecord,
} from './types.ts';

const NOW = '2026-07-20T15:00:00.000Z';

Deno.test('kernel administration requires explicit approval for every exact app version', async () => {
  const repository = new AdminMemoryLmsKernelRepository();
  const packageRepository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPhotoRosterVersion(1, '0.1.0'),
      buildPhotoRosterVersion(2, '0.2.0'),
    ],
  });
  const service = createLmsKernelAdminService({
    repository,
    packageRepository,
    createId: sequentialIds(),
    createSecret: () => 'test-secret',
    now: () => new Date(NOW),
  });

  const installed = await service.installApp({
    membership: ownerMembership(),
    packageVersionId: 1,
  });
  assertEquals(installed.ok, true);
  if (!installed.ok) return;

  const incomplete = await service.activateInstallation({
    membership: ownerMembership(),
    installationId: installed.value.id,
  });
  assertEquals(incomplete, {
    ok: false,
    error: {
      code: 'approval_incomplete',
      message:
        'Approve every requested capability before activation: lms.roster.members.read, lms.roster.profile_photo.read.',
    },
  });

  for (
    const capability of [
      'lms.roster.members.read',
      'lms.roster.profile_photo.read',
    ] as const
  ) {
    const granted = await service.grantCapability({
      membership: ownerMembership(),
      installationId: installed.value.id,
      capability,
      lmsContextId: null,
    });
    assertEquals(granted.ok, true);
  }

  const activated = await service.activateInstallation({
    membership: ownerMembership(),
    installationId: installed.value.id,
  });
  assertEquals(activated.ok && activated.value.status, 'active');

  const upgraded = await service.installApp({
    membership: ownerMembership(),
    packageVersionId: 2,
  });
  assertEquals(upgraded.ok, true);
  if (!upgraded.ok) return;
  assertEquals(upgraded.value.status, 'pending_approval');

  const oldGrantsDoNotCarry = await service.activateInstallation({
    membership: ownerMembership(),
    installationId: upgraded.value.id,
  });
  assertEquals(oldGrantsDoNotCarry.ok, false);
  if (!oldGrantsDoNotCarry.ok) {
    assertEquals(oldGrantsDoNotCarry.error.code, 'approval_incomplete');
  }
  assertEquals(
    repository.events.map((event) => event.eventType),
    [
      'app_installation.created',
      'capability_grant.approved',
      'capability_grant.approved',
      'app_installation.activated',
      'app_installation.version_replaced',
    ],
  );
});

Deno.test('auditors cannot mutate governance and context grants cannot cross institutions', async () => {
  const repository = new AdminMemoryLmsKernelRepository();
  repository.contexts.push({
    id: 'foreign-context',
    institutionId: 'institution-2',
    lmsConnectionId: 'connection-2',
    providerContextId: 'course-2',
    label: 'Foreign course',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const service = createLmsKernelAdminService({
    repository,
    packageRepository: createInMemoryPackageReviewRepository({
      packageVersions: [buildPhotoRosterVersion(1, '0.1.0')],
    }),
    createId: sequentialIds(),
    now: () => new Date(NOW),
  });

  const denied = await service.installApp({
    membership: { ...ownerMembership(), role: 'auditor' },
    packageVersionId: 1,
  });
  assertEquals(denied.ok, false);
  if (!denied.ok) assertEquals(denied.error.code, 'permission_denied');

  const installed = await service.installApp({
    membership: ownerMembership(),
    packageVersionId: 1,
  });
  if (!installed.ok) throw new Error(installed.error.message);

  const crossTenantGrant = await service.grantCapability({
    membership: ownerMembership(),
    installationId: installed.value.id,
    capability: 'lms.roster.members.read',
    lmsContextId: 'foreign-context',
  });
  assertEquals(crossTenantGrant.ok, false);
  if (!crossTenantGrant.ok) assertEquals(crossTenantGrant.error.code, 'not_found');
});

class AdminMemoryLmsKernelRepository extends MemoryLmsKernelRepository {
  readonly installations: AppInstallationRecord[] = [];
  readonly contexts: LmsContextRecord[] = [];

  constructor() {
    super({ session: buildGovernedSyntheticSession(), grants: [] });
  }

  override getLmsContextById(id: string): Promise<LmsContextRecord | null> {
    return Promise.resolve(this.contexts.find((context) => context.id === id) ?? null);
  }

  override createInstallation(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly appId: string;
      readonly packageVersionId: number;
      readonly installedByUserId: string;
      readonly now: string;
    },
  ): Promise<AppInstallationRecord> {
    const installation: AppInstallationRecord = {
      id: input.id,
      institutionId: input.institutionId,
      appId: input.appId,
      packageVersionId: input.packageVersionId,
      status: 'pending_approval',
      installedByUserId: input.installedByUserId,
      installedAt: input.now,
      activatedAt: null,
      updatedAt: input.now,
    };
    this.installations.push(installation);
    this.recordGovernanceEvent(input.event);
    return Promise.resolve(installation);
  }

  override replaceInstallationPackageVersion(
    input: GovernedWrite & {
      readonly id: string;
      readonly institutionId: string;
      readonly packageVersionId: number;
      readonly installedByUserId: string;
      readonly now: string;
    },
  ): Promise<AppInstallationRecord | null> {
    const installation = this.updateInstallation(input.id, input.institutionId, (current) => ({
      ...current,
      packageVersionId: input.packageVersionId,
      status: 'pending_approval',
      installedByUserId: input.installedByUserId,
      installedAt: input.now,
      activatedAt: null,
      updatedAt: input.now,
    }));
    if (installation !== null) this.recordGovernanceEvent(input.event);
    return Promise.resolve(installation);
  }

  override getInstallationById(id: string): Promise<AppInstallationRecord | null> {
    return Promise.resolve(
      this.installations.find((installation) => installation.id === id) ?? null,
    );
  }

  override listInstallations(institutionId: string): Promise<AppInstallationRecord[]> {
    return Promise.resolve(
      this.installations.filter((installation) => installation.institutionId === institutionId),
    );
  }

  override activateInstallation(
    input: GovernedWrite & {
      readonly id: string;
      readonly activatedAt: string;
    },
  ): Promise<AppInstallationRecord | null> {
    const installation = this.updateInstallation(input.id, null, (current) => ({
      ...current,
      status: 'active',
      activatedAt: input.activatedAt,
      updatedAt: input.activatedAt,
    }));
    if (installation !== null) this.recordGovernanceEvent(input.event);
    return Promise.resolve(installation);
  }

  override createCapabilityGrant(
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
  ): Promise<CapabilityGrantRecord> {
    const grant: CapabilityGrantRecord = {
      id: input.id,
      institutionId: input.institutionId,
      appInstallationId: input.appInstallationId,
      packageVersionId: input.packageVersionId,
      capability: input.capability,
      scope: input.scope,
      approvedByUserId: input.approvedByUserId,
      approvedAt: input.approvedAt,
      revokedByUserId: null,
      revokedAt: null,
    };
    this.grants.push(grant);
    this.recordGovernanceEvent(input.event);
    return Promise.resolve(grant);
  }

  private updateInstallation(
    id: string,
    institutionId: string | null,
    update: (current: AppInstallationRecord) => AppInstallationRecord,
  ): AppInstallationRecord | null {
    const index = this.installations.findIndex((installation) =>
      installation.id === id &&
      (institutionId === null || installation.institutionId === institutionId)
    );
    if (index < 0) return null;
    const next = update(this.installations[index]!);
    this.installations[index] = next;
    return next;
  }
}

function buildPhotoRosterVersion(id: number, version: string) {
  return buildPackageVersionRecord({
    id,
    appId: 'photo-roster',
    version,
    approvalStatus: 'approved',
    reviewedAt: NOW,
    runtime: { kind: 'worker', entrypoint: '/dist/worker.js' },
    capabilities: [
      'lms.roster.members.read',
      'lms.roster.profile_photo.read',
    ],
  });
}

function ownerMembership(): InstitutionMembershipRecord {
  return {
    institutionId: 'institution-1',
    userId: 'owner-1',
    role: 'owner',
    createdAt: NOW,
  };
}

function sequentialIds(): () => string {
  let next = 0;
  return () => `id-${++next}`;
}
