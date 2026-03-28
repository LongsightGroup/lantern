import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import {
  buildAuditEventRecord,
  buildPackageVersionRecord,
  buildPreviewEvidenceRecord,
  buildPreviewSessionRecord,
  buildReviewedPlacementRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('GET /admin/placements/:placementId renders selected content, reviewed version, Canvas context, and evidence timeline', async () => {
  const repository = createInMemoryPackageReviewRepository({
    reviewedPlacements: [
      buildReviewedPlacementRecord({
        placementId: 'placement-audit-123',
        packageVersionId: 8,
        packageVersion: '0.8.0',
        packageTitle: 'Chapter 4 Asteroids',
        contentPath: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
        contextId: 'course-42',
        contextTitle: 'Physics 101',
        resourceLinkId: 'resource-link-123',
      }),
    ],
    previewSessions: [
      buildPreviewSessionRecord({
        sessionId: 'preview-session-123',
        packageVersionId: 8,
        packageVersion: '0.8.0',
      }),
    ],
    previewEvidence: [
      buildPreviewEvidenceRecord({
        previewSessionId: 'preview-session-123',
        eventType: 'preview.launch',
      }),
    ],
    auditEvents: [
      buildAuditEventRecord({
        eventType: 'deep_linking.request.accepted',
        packageVersionId: 8,
      }),
      buildAuditEventRecord({
        eventType: 'deep_linking.placement.created',
        packageVersionId: 8,
        summary: 'Created reviewed placement from Deep Linking selection.',
        detail: { placementId: 'placement-audit-123' },
      }),
      buildAuditEventRecord({
        eventType: 'reviewer.preview_viewed',
        packageVersionId: 8,
        summary: 'Reviewer opened governed preview evidence.',
        detail: { placementId: 'placement-audit-123' },
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/placements/placement-audit-123');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Placement audit');
  assertStringIncludes(body, 'placement-audit-123');
  assertStringIncludes(body, 'Chapter 4 Asteroids');
  assertStringIncludes(body, 'Version 0.8.0');
  assertStringIncludes(body, '/content/bonus.json');
  assertStringIncludes(body, 'Physics 101');
  assertStringIncludes(body, 'reviewer.preview_viewed');
  assertStringIncludes(body, 'Open preview evidence');
});

Deno.test('GET /admin/placements renders a lookup page and unknown placement ids still fail clearly', async () => {
  const repository = createInMemoryPackageReviewRepository();
  const app = createApp({ getRepository: () => repository });

  const missingIdResponse = await app.request('http://localhost/admin/placements');
  assertEquals(missingIdResponse.status, 200);
  const missingIdBody = await missingIdResponse.text();
  assertStringIncludes(missingIdBody, 'Open one reviewed placement.');
  assertStringIncludes(missingIdBody, 'name="placementId"');

  const unknownResponse = await app.request('http://localhost/admin/placements/placement-missing');
  assertEquals(unknownResponse.status, 404);
  const unknownBody = await unknownResponse.text();
  assertStringIncludes(unknownBody, 'Placement audit unavailable');
  assertStringIncludes(unknownBody, 'Reviewed placement placement-missing was not found.');
});

Deno.test('approved package dossier includes a governed preview launch link', async () => {
  const seededRepository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 41,
        approvalStatus: 'approved',
        reviewNotes: 'Ready for governed preview.',
        reviewedAt: '2026-03-25T00:40:00Z',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => seededRepository,
  }).request('http://localhost/admin/packages/chapter-4-asteroids/versions/0.1.0');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, '/admin/packages/chapter-4-asteroids/versions/0.1.0/preview');
  assertStringIncludes(body, 'href="/admin/placements"');
});
