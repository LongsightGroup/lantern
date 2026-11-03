import { test } from 'vite-plus/test';
import { assert, assertEquals, assertRejects } from '@std/assert';
import type { D1Database } from '../db/d1.ts';
import { runD1 } from '../db/d1.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import { createLmsKernelAdminService } from './admin_service.ts';
import { withKernelD1 } from './d1_test_support.ts';
import { adminGovernanceEvent } from './governance_events.ts';
import { authorizeRosterRead } from './policy.ts';
import { createD1LmsKernelRepository } from './repository_d1.ts';
import { buildGovernedSyntheticSession } from './repository_memory_test_support.ts';
import type { LmsKernelRepository } from './repository.ts';

const NOW = '2026-07-20T15:00:00.000Z';
const CAPABILITIES = [
  'lms.roster.members.read',
  'lms.roster.contact.read',
  'lms.roster.profile_photo.read',
] as const;
const OWNER = {
  institutionId: 'institution-1',
  userId: 'admin-1',
  role: 'owner',
  createdAt: NOW,
} as const;

test('D1 version replacement invalidates old sessions, grants, and photos permanently', async () => {
  await withKernelD1(async (db) => {
    const repository = await seedRuntime(db);
    const admin = createLmsKernelAdminService({
      repository,
      now: () => new Date(NOW),
      packageRepository: createInMemoryPackageReviewRepository({
        packageVersions: [1, 2].map((id) =>
          buildPackageVersionRecord({
            id,
            appId: 'photo-roster',
            version: `0.${id}.0`,
            approvalStatus: 'approved',
            runtime: { kind: 'worker', entrypoint: '/dist/worker.js' },
            capabilities: [...CAPABILITIES],
          }),
        ),
      }),
    });
    const lookup = { runtimeSessionId: 'runtime-1', runtimeSessionToken: 'runtime-token' };
    const before = await repository.getGovernedRuntimeSession(lookup);
    assert(before !== null);
    assertEquals(before.lmsOrigin, 'https://courses.example.edu');
    assertEquals(
      authorizeRosterRead({
        session: before,
        grants: await repository.listCapabilityGrants('installation-1'),
        requestedCapabilities: CAPABILITIES,
        now: new Date(NOW),
      }).allowed,
      true,
    );
    assert(
      (await repository.getAuthorizedProtectedMediaReference({ id: 'media-1', now: NOW })) !== null,
    );

    assert((await admin.installApp({ membership: OWNER, packageVersionId: 2 })).ok);
    assertEquals(await repository.getGovernedRuntimeSession(lookup), null);
    assertEquals(
      (await repository.listCapabilityGrants('installation-1')).every(
        (grant) => grant.revokedAt === NOW,
      ),
      true,
    );
    assertEquals(
      (await admin.activateInstallation({ membership: OWNER, installationId: 'installation-1' }))
        .ok,
      false,
    );
    for (const capability of CAPABILITIES) {
      assert(
        (
          await admin.grantCapability({
            membership: OWNER,
            installationId: 'installation-1',
            capability,
            lmsContextId: 'context-1',
          })
        ).ok,
      );
    }
    assert(
      (await admin.activateInstallation({ membership: OWNER, installationId: 'installation-1' }))
        .ok,
    );
    assertEquals(await repository.getGovernedRuntimeSession(lookup), null);
    assertEquals(
      await repository.getAuthorizedProtectedMediaReference({ id: 'media-1', now: NOW }),
      null,
    );

    // Reinstalling the same old version must require fresh approval, not revive old sessions.
    assert((await admin.installApp({ membership: OWNER, packageVersionId: 1 })).ok);
    assertEquals(
      (await admin.activateInstallation({ membership: OWNER, installationId: 'installation-1' }))
        .ok,
      false,
    );
    for (const capability of CAPABILITIES) {
      assert(
        (
          await admin.grantCapability({
            membership: OWNER,
            installationId: 'installation-1',
            capability,
            lmsContextId: 'context-1',
          })
        ).ok,
      );
    }
    assert(
      (await admin.activateInstallation({ membership: OWNER, installationId: 'installation-1' }))
        .ok,
    );
    const retired = await repository.getGovernedRuntimeSession(lookup);
    assert(retired !== null);
    assertEquals(
      authorizeRosterRead({
        session: retired,
        grants: await repository.listCapabilityGrants('installation-1'),
        requestedCapabilities: CAPABILITIES,
        now: new Date(NOW),
      }),
      { allowed: false, reason: 'session_expired' },
    );
    assertEquals(
      await repository.getAuthorizedProtectedMediaReference({ id: 'media-1', now: NOW }),
      null,
    );
  });
});

test('D1 rolls back session and grant invalidation when version replacement audit fails', async () => {
  await withKernelD1(async (db) => {
    const repository = await seedRuntime(db);
    await assertRejects(() =>
      repository.replaceInstallationPackageVersion({
        id: 'installation-1',
        institutionId: 'institution-1',
        packageVersionId: 2,
        installedByUserId: 'admin-1',
        now: NOW,
        event: event('app_installation.version_replaced', 999_999),
      }),
    );
    const session = await repository.getGovernedRuntimeSession({
      runtimeSessionId: 'runtime-1',
      runtimeSessionToken: 'runtime-token',
    });
    assert(session !== null);
    assertEquals(session.runtimeExpiresAt, '2026-07-20T15:10:00.000Z');
    assertEquals(
      (await repository.listCapabilityGrants('installation-1')).every(
        (grant) => grant.revokedAt === null,
      ),
      true,
    );
    assert(
      (await repository.getAuthorizedProtectedMediaReference({ id: 'media-1', now: NOW })) !== null,
    );
  });
});

async function seedRuntime(db: D1Database): Promise<LmsKernelRepository> {
  const repository = createD1LmsKernelRepository(db);
  await runD1(
    db,
    `INSERT INTO auth_users (id,name,email,emailVerified,createdAt,updatedAt)
    VALUES ('admin-1','Admin','admin@example.edu',1,?,?)`,
    [NOW, NOW],
  );
  await repository.createInstitutionWithOwner({
    id: 'institution-1',
    slug: 'test',
    name: 'Test University',
    ownerUserId: 'admin-1',
    now: NOW,
    event: event('institution.created'),
  });
  for (const id of [1, 2]) {
    await runD1(
      db,
      `INSERT INTO package_versions (
      id,app_id,version,title,owner_type,owner_id,entrypoint,roles,install_scope,capabilities,
      grading_mode,approval_status,manifest_json,artifact_root,artifact_digest,runtime_contract,runtime_contract_signature
    ) VALUES (?,'photo-roster',?,'Photo Roster','user','admin-1','/dist/worker.js','[]','course',?,
      'manual','approved','{}','snapshot','digest','{}','signature')`,
      [id, `0.${id}.0`, CAPABILITIES],
    );
  }
  await repository.createLmsConnection({
    id: 'connection-1',
    institutionId: 'institution-1',
    label: 'Test LMS',
    platformType: 'canvas',
    issuer: 'https://issuer.example',
    lmsOrigin: 'https://courses.example.edu',
    clientId: 'client',
    deploymentId: 'deployment',
    authorizationEndpoint: 'https://sso.example/authorize',
    accessTokenUrl: 'https://sso.example/token',
    jwksUrl: 'https://sso.example/jwks',
    now: NOW,
    event: event('lms_connection.created'),
  });
  await repository.activateLmsConnection({
    id: 'connection-1',
    validatedAt: NOW,
    event: event('lms_connection.validated'),
  });
  await repository.getOrCreateLmsContext({
    id: 'context-1',
    institutionId: 'institution-1',
    lmsConnectionId: 'connection-1',
    providerContextId: 'course-1',
    label: null,
    now: NOW,
  });
  await repository.createInstallation({
    id: 'installation-1',
    institutionId: 'institution-1',
    appId: 'photo-roster',
    packageVersionId: 1,
    installedByUserId: 'admin-1',
    now: NOW,
    event: event('app_installation.created', 1),
  });
  for (const capability of CAPABILITIES) {
    await repository.createCapabilityGrant({
      id: `grant-${capability}`,
      institutionId: 'institution-1',
      appInstallationId: 'installation-1',
      packageVersionId: 1,
      capability,
      scope: { kind: 'context', lmsContextId: 'context-1' },
      approvedByUserId: 'admin-1',
      approvedAt: NOW,
      event: event('capability_grant.approved', 1),
    });
  }
  await repository.activateInstallation({
    id: 'installation-1',
    activatedAt: NOW,
    event: event('app_installation.activated', 1),
  });
  const session = {
    ...buildGovernedSyntheticSession(),
    runtimeExpiresAt: '2026-07-20T15:10:00.000Z',
  };
  await repository.createGovernedRuntimeSession({
    session,
    createdAt: NOW,
    event: event('launch.accepted', 1),
  });
  await repository.getOrCreateSubjectIdentity({
    id: 'subject-1',
    institutionId: 'institution-1',
    lmsConnectionId: 'connection-1',
    providerSubjectId: 'provider-1',
    now: NOW,
  });
  await repository.saveProtectedMediaReference({
    id: 'media-1',
    traceId: session.launchTraceId,
    institutionId: session.institutionId,
    lmsConnectionId: session.lmsConnectionId,
    lmsContextId: session.lmsContextId,
    runtimeSessionId: session.runtimeSessionId,
    appInstallationId: session.appInstallationId,
    packageVersionId: session.packageVersionId,
    subjectIdentityId: 'subject-1',
    actorSubjectId: session.actorSubjectId,
    actorType: session.actorType,
    connectorKind: session.connectorKind,
    sourceUrl: 'https://images.example/profile.png',
    expiresAt: '2026-07-20T15:05:00.000Z',
  });
  return repository;
}

function event(eventType: string, packageVersionId?: number) {
  return adminGovernanceEvent({
    eventType,
    traceId: crypto.randomUUID(),
    institutionId: 'institution-1',
    actorId: 'admin-1',
    occurredAt: NOW,
    ...(packageVersionId === undefined ? {} : { packageVersionId }),
  });
}
