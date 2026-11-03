import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { ADMIN_TEST_IDENTITY } from '../admin_auth/page_input.ts';
import { renderPackageOverviewPage } from './package_overview.ts';
import { buildPackageVersionRecord } from '../test_helpers/package_review.ts';

test('renderPackageOverviewPage directs reviewed versions through governance', () => {
  const body = renderPackageOverviewPage({
    identity: ADMIN_TEST_IDENTITY,
    appId: 'typescript-ladder-game',
    appTitle: 'TypeScript Ladder Game',
    history: [
      buildPackageVersionRecord({
        id: 3,
        appId: 'typescript-ladder-game',
        title: 'TypeScript Ladder Game',
        version: '0.2.1',
        approvalStatus: 'approved',
        importedAt: '2026-04-09T22:38:00Z',
      }),
      buildPackageVersionRecord({
        id: 2,
        appId: 'typescript-ladder-game',
        title: 'TypeScript Ladder Game',
        version: '0.2.0',
        approvalStatus: 'approved',
        importedAt: '2026-04-09T21:27:00Z',
      }),
    ],
  });

  assertStringIncludes(
    body,
    'Each immutable version is reviewed independently before an institution can install it.',
  );
  assertStringIncludes(body, 'Current reviewed baseline');
  assertStringIncludes(body, 'version-row-current');
  assertStringIncludes(body, 'Install through governance');
  assertStringIncludes(body, 'version-row-actions');
  assertEquals(body.includes('/deployment'), false);
});
