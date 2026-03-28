import { assert, assertEquals, assertRejects } from '@std/assert';
import { resolveCanvasIssuer } from '../lti/config.ts';
import {
  buildImportedPackageVersion,
  withRepositoryTestDatabase,
} from './repository_test_support.ts';

Deno.test('repository rejects duplicate app versions and returns semver-sorted history', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const version010 = await buildImportedPackageVersion();
    const version020 = await buildImportedPackageVersion({ version: '0.2.0' });
    const version0100 = await buildImportedPackageVersion({
      version: '0.10.0',
    });

    const firstRecord = await repository.registerPackageVersion(version010);
    await repository.registerPackageVersion(version020);
    await repository.registerPackageVersion(version0100);

    await assertRejects(
      () => repository.registerPackageVersion(version010),
      Error,
      'Package version chapter-4-asteroids@0.1.0 already exists and cannot be replaced.',
    );

    const detail = await repository.getPackageVersionByAppVersion('chapter-4-asteroids', '0.10.0');
    const history = await repository.listPackageVersionsByApp('chapter-4-asteroids');

    assert(detail);
    assertEquals(firstRecord.approvalStatus, 'pending');
    assertEquals(detail?.version, '0.10.0');
    assertEquals(
      history.map((record) => record.version),
      ['0.10.0', '0.2.0', '0.1.0'],
    );
  });
});

Deno.test('repository records one-way approval and rejection decisions with optional notes', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvalCandidate = await repository.registerPackageVersion(
      await buildImportedPackageVersion(),
    );
    const rejectionCandidate = await repository.registerPackageVersion(
      await buildImportedPackageVersion({ version: '0.2.0' }),
    );

    const approved = await repository.approvePackageVersion({
      id: approvalCandidate.id,
      reviewNotes: 'Ready for the pilot deployment.',
    });
    const rejected = await repository.rejectPackageVersion({
      id: rejectionCandidate.id,
      reviewNotes: null,
    });

    assertEquals(approved.approvalStatus, 'approved');
    assertEquals(approved.reviewNotes, 'Ready for the pilot deployment.');
    assert(approved.reviewedAt !== null);
    assertEquals(rejected.approvalStatus, 'rejected');
    assertEquals(rejected.reviewNotes, null);
    assert(rejected.reviewedAt !== null);

    await assertRejects(
      () =>
        repository.rejectPackageVersion({
          id: approvalCandidate.id,
          reviewNotes: 'Trying to reverse an approval.',
        }),
      Error,
      'Package version chapter-4-asteroids@0.1.0 has already been reviewed and cannot change state.',
    );
    await assertRejects(
      () =>
        repository.approvePackageVersion({
          id: rejectionCandidate.id,
          reviewNotes: 'Trying to reverse a rejection.',
        }),
      Error,
      'Package version chapter-4-asteroids@0.2.0 has already been reviewed and cannot change state.',
    );
  });
});

Deno.test('repository pins exact approved versions and preserves the existing deployment on rejected updates', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for the first pilot.',
    });
    const pendingRecord = await repository.registerPackageVersion(
      await buildImportedPackageVersion({ version: '0.2.0' }),
    );
    const otherAppRecord = await repository.approvePackageVersion({
      id: (
        await repository.registerPackageVersion(
          await buildImportedPackageVersion({
            appId: 'algebra-helper',
            version: '1.0.0',
            title: 'Algebra Helper',
            snapshotRoot: 'var/packages/algebra-helper/1.0.0',
          }),
        )
      ).id,
      reviewNotes: 'Approved for a different app.',
    });

    const deployment = await repository.pinDeploymentVersion({
      slug: 'demo-course',
      label: 'Demo Course',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });

    assertEquals(deployment.enabledPackageVersionId, approvedRecord.id);
    assertEquals(deployment.enabledPackageVersion, '0.1.0');

    await assertRejects(
      () =>
        repository.pinDeploymentVersion({
          slug: 'demo-course',
          label: 'Demo Course',
          appId: 'chapter-4-asteroids',
          packageVersionId: pendingRecord.id,
        }),
      Error,
      'Only approved package versions can be enabled.',
    );
    await assertRejects(
      () =>
        repository.pinDeploymentVersion({
          slug: 'demo-course',
          label: 'Demo Course',
          appId: 'chapter-4-asteroids',
          packageVersionId: otherAppRecord.id,
        }),
      Error,
      'Package version algebra-helper@1.0.0 does not belong to deployment app chapter-4-asteroids.',
    );

    const persistedDeployment = await repository.getDeploymentBySlug('demo-course');

    assert(persistedDeployment);
    assertEquals(persistedDeployment?.enabledPackageVersionId, approvedRecord.id);
    assertEquals(persistedDeployment?.enabledPackageVersion, '0.1.0');
  });
});

Deno.test('repository keeps internal preview deployments separate from managed LMS slots', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const approvedRecord = await repository.approvePackageVersion({
      id: (await repository.registerPackageVersion(await buildImportedPackageVersion())).id,
      reviewNotes: 'Approved for preview and pilot launch.',
    });

    const managedDeployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
    });
    const previewDeployment = await repository.pinDeploymentVersion({
      slug: 'chapter-4-asteroids-preview',
      label: 'Chapter 4 Asteroids Preview',
      appId: 'chapter-4-asteroids',
      packageVersionId: approvedRecord.id,
      lmsType: 'preview',
    });

    const managedDeployments = await repository.listDeploymentsByApp('chapter-4-asteroids');
    const fetchedPreview = await repository.getDeploymentBySlug('chapter-4-asteroids-preview');

    assertEquals(managedDeployment.lmsType, 'canvas');
    assertEquals(previewDeployment.lmsType, 'preview');
    assertEquals(
      managedDeployments.map((deployment) => deployment.slug),
      ['chapter-4-asteroids-pilot'],
    );
    assertEquals(fetchedPreview?.slug, 'chapter-4-asteroids-preview');
    assertEquals(fetchedPreview?.lmsType, 'preview');
  });
});

Deno.test('repository saves one exact Canvas binding per deployment and rejects duplicate bindings', async () => {
  await withRepositoryTestDatabase(async ({ repository }) => {
    const saved = await repository.saveDeploymentBinding({
      slug: 'chapter-4-asteroids-pilot',
      label: 'Chapter 4 Asteroids Pilot Deployment',
      appId: 'chapter-4-asteroids',
      binding: {
        lms: 'canvas',
        canvasEnvironment: 'production',
        issuer: resolveCanvasIssuer('production'),
        clientId: '10000000000001',
        deploymentId: 'deployment-123',
      },
    });

    assert(saved.binding !== null);
    assertEquals(saved.binding?.lms, 'canvas');

    if (saved.binding?.lms !== 'canvas') {
      throw new Error('Expected a Canvas deployment binding.');
    }

    assertEquals(saved.binding.canvasEnvironment, 'production');
    assertEquals(saved.binding.clientId, '10000000000001');
    assertEquals(saved.binding.deploymentId, 'deployment-123');

    const fetched = await repository.getDeploymentByBinding({
      lms: 'canvas',
      issuer: resolveCanvasIssuer('production'),
      clientId: '10000000000001',
      deploymentId: 'deployment-123',
    });

    assert(fetched);
    assertEquals(fetched?.slug, 'chapter-4-asteroids-pilot');

    await repository.saveDeploymentBinding({
      slug: 'second-app-pilot',
      label: 'Second App Pilot Deployment',
      appId: 'second-app',
      binding: {
        lms: 'canvas',
        canvasEnvironment: 'beta',
        issuer: resolveCanvasIssuer('beta'),
        clientId: '10000000000002',
        deploymentId: 'deployment-456',
      },
    });

    await assertRejects(
      () =>
        repository.saveDeploymentBinding({
          slug: 'duplicate-binding',
          label: 'Duplicate Binding',
          appId: 'duplicate-app',
          binding: {
            lms: 'canvas',
            canvasEnvironment: 'production',
            issuer: resolveCanvasIssuer('production'),
            clientId: '10000000000001',
            deploymentId: 'deployment-123',
          },
        }),
      Error,
      'Canvas binding 10000000000001 / deployment-123 already belongs to another deployment.',
    );
  });
});
