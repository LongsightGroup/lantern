import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderDeepLinkingPickerPage } from './deep_linking_picker.ts';
import {
  buildDeepLinkingResourceOption,
  buildDeepLinkingResourceSelection,
} from '../test_helpers/package_review.ts';

Deno.test('deep linking picker fixtures expose approved assignment resources with canonical content paths', () => {
  const option = buildDeepLinkingResourceOption();

  assertEquals(option.installScope, 'assignment');
  assertEquals(option.approvalStatus, 'approved');
  assertEquals(option.contentPath, '/content/activity.json');
  assertEquals(option.activityId, '/content/activity.json');
});

Deno.test('deep linking picker separates save from Canvas return and only enables return from one saved selection', () => {
  const readyHtml = renderDeepLinkingPickerPage({
    sessionId: 'deep-linking-session-123',
    token: 'deep-linking-token-123',
    session: {
      appId: 'chapter-4-asteroids',
      deploymentSlug: 'chapter-4-asteroids-pilot',
      contextTitle: 'Physics 101',
      expiresAt: '2026-03-24T16:30:00Z',
    },
    resources: [
      buildDeepLinkingResourceOption(),
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
    selection: buildDeepLinkingResourceSelection({
      packageVersionId: 2,
      packageVersion: '0.2.0',
      contentPath: '/content/bonus.json',
      activityId: '/content/bonus.json',
      contentTitle: 'Bonus Activity',
    }),
    notice: null,
  });
  const blockedHtml = renderDeepLinkingPickerPage({
    sessionId: 'deep-linking-session-123',
    token: 'deep-linking-token-123',
    session: {
      appId: 'chapter-4-asteroids',
      deploymentSlug: 'chapter-4-asteroids-pilot',
      contextTitle: 'Physics 101',
      expiresAt: '2026-03-24T16:30:00Z',
    },
    resources: [
      buildDeepLinkingResourceOption(),
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
    selection: null,
    notice: null,
  });

  assertStringIncludes(readyHtml, 'Chapter 4 Asteroids');
  assertStringIncludes(readyHtml, '0.2.0');
  assertStringIncludes(readyHtml, '/content/bonus.json');
  assertStringIncludes(readyHtml, 'Bonus Activity');
  assertStringIncludes(readyHtml, 'Save reviewed selection');
  assertStringIncludes(readyHtml, '/lti/deep-linking/sessions/deep-linking-session-123/submit');
  assertStringIncludes(readyHtml, 'Ready to return to Canvas from this saved reviewed selection.');
  assertStringIncludes(readyHtml, 'Return to Canvas');
  assertStringIncludes(readyHtml, 'deep-linking-token-123');
  assertStringIncludes(blockedHtml, 'Save one reviewed selection before returning to Canvas.');
  assertStringIncludes(blockedHtml, 'disabled>Return to Canvas</button>');
});

Deno.test('deep linking picker blocks Canvas return when Lantern cannot verify the session token', () => {
  const html = renderDeepLinkingPickerPage({
    sessionId: 'deep-linking-session-123',
    session: {
      appId: 'chapter-4-asteroids',
      deploymentSlug: 'chapter-4-asteroids-pilot',
      contextTitle: 'Physics 101',
      expiresAt: '2026-03-24T16:30:00Z',
    },
    resources: [buildDeepLinkingResourceOption()],
    selection: buildDeepLinkingResourceSelection(),
    notice: null,
  });

  assertStringIncludes(
    html,
    'Return to Canvas is unavailable until Lantern can verify this session.',
  );
  assertStringIncludes(html, 'disabled>Return to Canvas</button>');
});
