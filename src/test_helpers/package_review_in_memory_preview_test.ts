import { test } from 'vite-plus/test';
import { assertEquals } from '@std/assert';
import {
  buildAdminPreviewSessionRecord,
  buildAuthoringPreviewSessionRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './package_review.ts';

test('in-memory preview helpers seed admin and authoring sessions with typed defaults', async () => {
  const packageVersion = buildPackageVersionRecord({
    id: 11,
    appId: 'chapter-4-asteroids',
    version: '0.1.0',
    approvalStatus: 'approved',
  });
  const adminSession = buildAdminPreviewSessionRecord({
    sessionId: 'preview-session-admin',
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
  });
  const authoringSession = buildAuthoringPreviewSessionRecord({
    sessionId: 'preview-session-authoring',
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [packageVersion],
    previewSessions: [adminSession, authoringSession],
  });

  assertEquals(
    (await repository.getPreviewSessionById(adminSession.sessionId))?.origin,
    'adminTestLaunch',
  );
  assertEquals(
    (await repository.getPreviewSessionById(authoringSession.sessionId))?.origin,
    'adminAuthoringDraft',
  );
});

test('in-memory preview lookup honors the same origin filter as the repository contract', async () => {
  const packageVersion = buildPackageVersionRecord({
    id: 12,
    appId: 'chapter-4-asteroids',
    version: '0.2.0',
    approvalStatus: 'approved',
  });
  const adminSession = buildAdminPreviewSessionRecord({
    sessionId: 'preview-session-admin-filter',
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
    createdAt: '2026-04-01T09:00:00Z',
  });
  const authoringSession = buildAuthoringPreviewSessionRecord({
    sessionId: 'preview-session-authoring-filter',
    packageVersionId: packageVersion.id,
    appId: packageVersion.appId,
    packageVersion: packageVersion.version,
    packageTitle: packageVersion.title,
    createdAt: '2026-04-01T09:05:00Z',
  });
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [packageVersion],
    previewSessions: [adminSession, authoringSession],
  });

  assertEquals(
    (await repository.getLatestPreviewSessionByPackageVersion(packageVersion.id))?.sessionId,
    authoringSession.sessionId,
  );
  assertEquals(
    (await repository.getLatestPreviewSessionByPackageVersion(packageVersion.id, 'adminTestLaunch'))
      ?.sessionId,
    adminSession.sessionId,
  );
  assertEquals(
    (
      await repository.getLatestPreviewSessionByPackageVersion(
        packageVersion.id,
        'adminAuthoringDraft',
      )
    )?.sessionId,
    authoringSession.sessionId,
  );
});

test('preview test builders expose explicit origin and selected content defaults', () => {
  const adminSession = buildAdminPreviewSessionRecord();
  const authoringSession = buildAuthoringPreviewSessionRecord();

  assertEquals(adminSession.origin, 'adminTestLaunch');
  assertEquals(adminSession.contentPath, '/content/activity.json');
  assertEquals(authoringSession.origin, 'adminAuthoringDraft');
  assertEquals(authoringSession.contentPath, '/content/bonus.json');
});
