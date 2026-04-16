import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderPackageOverviewPage } from './package_overview.ts';
import {
  buildDeploymentRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import { buildCanvasDeploymentBinding } from '../test_helpers/lti.ts';

Deno.test('renderPackageOverviewPage keeps latest approved distinct from live rollout', () => {
  const body = renderPackageOverviewPage({
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
    deployments: [
      buildDeploymentRecord({
        appId: 'typescript-ladder-game',
        enabledPackageVersionId: 2,
        enabledPackageVersion: '0.2.0',
        binding: buildCanvasDeploymentBinding(),
      }),
    ],
  });

  assertStringIncludes(
    body,
    'Each version shows whether it is the current reviewed baseline and whether it is live in LMS now.',
  );
  assertStringIncludes(body, 'Current reviewed baseline');
  assertStringIncludes(body, 'version-row-current');
  assertStringIncludes(body, 'Live now in 1 LMS setup');
  assertStringIncludes(body, 'Not live in LMS');
  assertStringIncludes(body, 'version-row-actions');
  assertEquals(body.includes('Live rollout'), false);
});
