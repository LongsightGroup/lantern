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

Deno.test('deep linking picker adjusts copy for resource_selection course placement', () => {
  const html = renderDeepLinkingPickerPage({
    sessionId: 'deep-linking-session-123',
    token: 'deep-linking-token-123',
    session: {
      appId: 'chapter-4-asteroids',
      deploymentSlug: 'chapter-4-asteroids-pilot',
      contextTitle: 'Physics 101',
      expiresAt: '2026-03-24T16:30:00Z',
      placement: 'resource_selection',
    },
    resources: [
      buildDeepLinkingResourceOption({
        installScope: 'course',
      }),
    ],
    selection: null,
    notice: null,
  });

  assertStringIncludes(html, 'Select one reviewed resource for course placement.');
  assertStringIncludes(html, 'Choose one approved course resource below.');
  assertStringIncludes(html, 'Save one reviewed course resource before returning it to the LMS.');
  assertEquals(
    html.includes('No approved course-scope reviewed resources are available for this app yet.'),
    false,
  );
});

Deno.test('deep linking picker separates save from LMS return and only enables return from one saved selection', () => {
  const readyHtml = renderDeepLinkingPickerPage({
    sessionId: 'deep-linking-session-123',
    token: 'deep-linking-token-123',
    session: {
      appId: 'chapter-4-asteroids',
      deploymentSlug: 'chapter-4-asteroids-pilot',
      contextTitle: 'Physics 101',
      expiresAt: '2026-03-24T16:30:00Z',
      placement: 'assignment_selection',
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
      placement: 'assignment_selection',
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
  assertStringIncludes(readyHtml, 'Ready to return this reviewed assignment resource to the LMS.');
  assertStringIncludes(readyHtml, 'Return to LMS');
  assertStringIncludes(readyHtml, 'deep-linking-token-123');
  assertStringIncludes(
    blockedHtml,
    'Save one reviewed assignment resource before returning it to the LMS.',
  );
  assertStringIncludes(blockedHtml, 'disabled>Return to LMS</button>');
});

Deno.test('deep linking picker blocks LMS return when Lantern cannot verify the session token', () => {
  const html = renderDeepLinkingPickerPage({
    sessionId: 'deep-linking-session-123',
    session: {
      appId: 'chapter-4-asteroids',
      deploymentSlug: 'chapter-4-asteroids-pilot',
      contextTitle: 'Physics 101',
      expiresAt: '2026-03-24T16:30:00Z',
      placement: 'assignment_selection',
    },
    resources: [buildDeepLinkingResourceOption()],
    selection: buildDeepLinkingResourceSelection(),
    notice: null,
  });

  assertStringIncludes(html, 'Return to LMS is unavailable until Lantern can verify this session.');
  assertStringIncludes(html, 'disabled>Return to LMS</button>');
});
