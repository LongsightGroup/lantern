import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { buildDeepLinkingSelectionValue } from './lti/deep_linking.ts';
import {
  buildDeepLinkingResourceOption,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';
import { buildDeepLinkingSessionRecord } from './test_helpers/lti.ts';

Deno.test('GET /lti/deep-linking/sessions/:id renders only approved assignment resources for the bound app', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-picker',
        sessionToken: 'deep-linking-token-picker',
        appId: 'chapter-4-asteroids',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption(),
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
      buildDeepLinkingResourceOption({
        appId: 'other-app',
        packageTitle: 'Other App',
        contentPath: '/content/ignore.json',
        activityId: '/content/ignore.json',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-picker?token=deep-linking-token-picker',
  );

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Chapter 4 Asteroids');
  assertStringIncludes(body, '0.2.0');
  assertStringIncludes(body, '/content/bonus.json');
  assertStringIncludes(
    body,
    'Save one reviewed assignment resource before returning it to the LMS.',
  );
  assertEquals(body.includes('Other App'), false);
});

Deno.test('GET /lti/deep-linking/sessions/:id renders only approved course resources for resource_selection placement', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-course-picker',
        sessionToken: 'deep-linking-token-course-picker',
        appId: 'chapter-4-asteroids',
        placement: 'resource_selection',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption({
        installScope: 'course',
        packageVersion: '0.3.0',
        contentPath: '/content/course.json',
        activityId: '/content/course.json',
        contentTitle: 'Course Activity',
      }),
      buildDeepLinkingResourceOption({
        installScope: 'assignment',
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Assignment Activity',
      }),
    ],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request(
    'http://localhost/lti/deep-linking/sessions/deep-linking-session-course-picker?token=deep-linking-token-course-picker',
  );

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Select one reviewed resource for course placement.');
  assertStringIncludes(body, 'Course Activity');
  assertEquals(body.includes('Assignment Activity'), false);
  assertStringIncludes(body, 'Choose one approved course resource below.');
  assertStringIncludes(body, 'Save one reviewed course resource before returning it to the LMS.');
});

Deno.test('POST /lti/deep-linking/sessions/:id stores one explicit reviewed selection and re-renders the summary', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [
      buildDeepLinkingSessionRecord({
        sessionId: 'deep-linking-session-picker',
        sessionToken: 'deep-linking-token-picker',
        appId: 'chapter-4-asteroids',
        expiresAt: '2030-03-25T16:20:00Z',
      }),
    ],
    deepLinkingResourceOptions: [
      buildDeepLinkingResourceOption(),
      buildDeepLinkingResourceOption({
        packageVersionId: 2,
        packageVersion: '0.2.0',
        contentPath: '/content/bonus.json',
        activityId: '/content/bonus.json',
        contentTitle: 'Bonus Activity',
      }),
    ],
  });
  const formData = new FormData();

  formData.set('token', 'deep-linking-token-picker');
  formData.set(
    'selection',
    buildDeepLinkingSelectionValue({
      packageVersionId: 2,
      contentPath: '/content/bonus.json',
    }),
  );

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/lti/deep-linking/sessions/deep-linking-session-picker', {
    method: 'POST',
    body: formData,
  });
  const savedSession = await repository.getDeepLinkingSessionById('deep-linking-session-picker');

  assertEquals(response.status, 200);
  assertEquals(savedSession?.selection?.packageVersionId, 2);
  assertEquals(savedSession?.selection?.contentPath, '/content/bonus.json');

  const body = await response.text();

  assertStringIncludes(body, 'Selection saved');
  assertStringIncludes(body, 'Bonus Activity');
  assertStringIncludes(body, '/content/bonus.json');
  assertStringIncludes(body, 'Ready to return this reviewed assignment resource to the LMS.');
});

Deno.test('GET /lti/deep-linking/sessions/:id fails clearly when the session token is missing', async () => {
  const repository = createInMemoryPackageReviewRepository({
    deepLinkingSessions: [buildDeepLinkingSessionRecord({ expiresAt: '2030-03-25T16:20:00Z' })],
    deepLinkingResourceOptions: [buildDeepLinkingResourceOption()],
  });

  const response = await createApp({
    getRepository: () => repository,
  }).request('http://localhost/lti/deep-linking/sessions/deep-linking-session-123');

  assertEquals(response.status, 409);
  assertStringIncludes(await response.text(), 'Deep Linking session token is required.');
});
