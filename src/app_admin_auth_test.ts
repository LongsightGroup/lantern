import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { createTestApp as createApp } from './test_helpers/app.ts';
import {
  ADMIN_TEST_SESSION_TOKEN,
  cookieHeaderFromResponse,
  createAuthenticatedAdminAuth,
  createTestAdminAuth,
  createUnauthenticatedAdminAuth,
} from './test_helpers/admin_auth.ts';
import { adminSessionCookieValue } from './admin_auth/service.ts';
import { createInMemoryPackageReviewRepository } from './test_helpers/package_review.ts';

test('admin pages require authentication', async () => {
  const response = await createApp({
    adminAuth: createUnauthenticatedAdminAuth(),
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/admin/packages', {
    headers: { accept: 'text/html' },
  });

  assertEquals(response.status, 303);
  assertEquals(response.headers.get('location'), '/admin/login?returnTo=%2Fadmin%2Fpackages');
});

test('admin JSON requests return 401 when unauthenticated', async () => {
  const response = await createApp({
    adminAuth: createUnauthenticatedAdminAuth(),
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/admin/packages', {
    headers: { accept: 'application/json' },
  });

  assertEquals(response.status, 401);
  assertEquals(await response.text(), 'Authentication required.');
});

test('admin JSON requests with Accept */* return 401 when unauthenticated', async () => {
  const response = await createApp({
    adminAuth: createUnauthenticatedAdminAuth(),
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/admin/packages', {
    headers: { accept: '*/*' },
  });

  assertEquals(response.status, 401);
});

test('login and signup pages render without a session', async () => {
  const app = createApp({
    adminAuth: createUnauthenticatedAdminAuth(),
    getRepository: () => createInMemoryPackageReviewRepository(),
  });

  const login = await app.request('http://localhost/admin/login');
  const signup = await app.request('http://localhost/admin/signup');

  assertEquals(login.status, 200);
  assertStringIncludes(await login.text(), 'Sign in to Lantern');
  assertEquals(signup.status, 200);
  assertStringIncludes(await signup.text(), 'Create your Lantern admin account');
});

test('login page renders Google sign-in when configured', async () => {
  const app = createApp({
    adminAuth: createTestAdminAuth({
      session: null,
      socialProviders: [{ id: 'google', label: 'Google' }],
    }),
    getRepository: () => createInMemoryPackageReviewRepository(),
  });

  const login = await app.request('http://localhost/admin/login?returnTo=%2Fadmin%2Fpackages');

  assertEquals(login.status, 200);
  assertStringIncludes(await login.text(), 'Sign in with Google');
});

test('Google sign-in redirects to Google authorization URL', async () => {
  const app = createApp({
    adminAuth: createTestAdminAuth({
      session: null,
      socialProviders: [{ id: 'google', label: 'Google' }],
    }),
    getRepository: () => createInMemoryPackageReviewRepository(),
  });

  const response = await app.request('http://localhost/admin/login/google', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: new URLSearchParams({
      returnTo: '/admin/packages',
    }),
  });

  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get('location'),
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-google-client',
  );
  assertStringIncludes(response.headers.get('set-cookie') ?? '', 'better-auth.state=');
});

test('signup creates an admin session and redirects to packages', async () => {
  const auth = createUnauthenticatedAdminAuth();
  const app = createApp({
    adminAuth: auth,
    getRepository: () => createInMemoryPackageReviewRepository(),
  });

  const signup = await app.request('http://localhost/admin/signup', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: new URLSearchParams({
      name: 'New Admin',
      email: 'new-admin@example.test',
      password: 'password-123',
      returnTo: '/admin/packages',
    }),
  });
  const sessionCookie = cookieHeaderFromResponse(signup);
  const packages = await app.request('http://localhost/admin/packages', {
    headers: {
      cookie: sessionCookie ?? '',
    },
  });

  assertEquals(signup.status, 303);
  assertEquals(signup.headers.get('location'), '/admin/packages');
  assertEquals(packages.status, 200);
});

test('duplicate signup fails clearly', async () => {
  const response = await createApp({
    adminAuth: createTestAdminAuth({
      session: null,
      duplicateSignupEmail: 'admin@example.test',
    }),
    getRepository: () => createInMemoryPackageReviewRepository(),
  }).request('http://localhost/admin/signup', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: new URLSearchParams({
      name: 'Admin',
      email: 'admin@example.test',
      password: 'password-123',
      returnTo: '/admin/packages',
    }),
  });

  assertEquals(response.status, 409);
  assertStringIncludes(await response.text(), 'User already exists.');
});

test('login creates an admin session and redirects to requested admin path', async () => {
  const auth = createUnauthenticatedAdminAuth();
  const app = createApp({
    adminAuth: auth,
    getRepository: () => createInMemoryPackageReviewRepository(),
  });

  const login = await app.request('http://localhost/admin/login', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: new URLSearchParams({
      email: 'admin@example.test',
      password: 'password-123',
      returnTo: '/admin/packages',
    }),
  });
  const sessionCookie = cookieHeaderFromResponse(login);
  const packages = await app.request('http://localhost/admin/packages', {
    headers: {
      cookie: sessionCookie ?? '',
    },
  });

  assertEquals(login.status, 303);
  assertEquals(login.headers.get('location'), '/admin/packages');
  assertEquals(packages.status, 200);
});

test('logout invalidates the admin session', async () => {
  const auth = createAuthenticatedAdminAuth();
  const app = createApp({
    adminAuth: auth,
    getRepository: () => createInMemoryPackageReviewRepository(),
  });
  const sessionCookie = adminSessionCookieValue(ADMIN_TEST_SESSION_TOKEN);

  const logoutPage = await app.request('http://localhost/admin/logout', {
    headers: { cookie: sessionCookie },
  });
  const logout = await app.request('http://localhost/admin/logout', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: sessionCookie,
    },
  });
  const packages = await app.request('http://localhost/admin/packages', {
    headers: {
      accept: 'application/json',
      cookie: sessionCookie,
    },
  });

  assertEquals(logoutPage.status, 200);
  assertStringIncludes(await logoutPage.text(), 'Sign out of Lantern');
  assertEquals(logout.status, 303);
  assertEquals(logout.headers.get('location'), '/admin/login');
  assertEquals(packages.status, 401);
});

test('logout failure is shown and does not clear the admin session', async () => {
  const auth = createTestAdminAuth({
    session: {
      user: {
        id: 'test-admin-user',
        email: 'admin@example.test',
        name: 'Test Admin',
      },
    },
    signOutFailure: {
      success: false,
      status: 500,
      message: 'Better Auth did not invalidate the admin session.',
    },
  });
  const app = createApp({
    adminAuth: auth,
    getRepository: () => createInMemoryPackageReviewRepository(),
  });
  const sessionCookie = adminSessionCookieValue(ADMIN_TEST_SESSION_TOKEN);

  const logout = await app.request('http://localhost/admin/logout', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: sessionCookie,
    },
  });
  const packages = await app.request('http://localhost/admin/packages', {
    headers: { cookie: sessionCookie },
  });

  assertEquals(logout.status, 500);
  assertStringIncludes(await logout.text(), 'Better Auth did not invalidate the admin session.');
  assertEquals(packages.status, 200);
});

test('public LTI, runtime, health, and config routes do not require admin auth', async () => {
  const app = createApp({
    adminAuth: createUnauthenticatedAdminAuth(),
    getRepository: () => createInMemoryPackageReviewRepository(),
  });

  const health = await app.request('http://localhost/health');
  const runtime = await app.request('http://localhost/runtime/missing-session');
  const ltiLogin = await app.request('http://localhost/lti/login');

  assertEquals(health.status, 200);
  assertEquals(runtime.status, 404);
  assertEquals(ltiLogin.status === 303 || ltiLogin.status === 400 || ltiLogin.status === 409, true);
});
