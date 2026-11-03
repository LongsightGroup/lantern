import type {
  AdminAuthFormFailure,
  AdminAuthFormResult,
  AdminAuthService,
  AdminAuthSession,
} from '../admin_auth/service.ts';
import type { AdminAuthSocialProvider } from '../admin_auth/config.ts';
import {
  adminSessionCookieValue,
  expiredAdminSessionCookieValue,
  readAdminSessionCookie,
} from '../admin_auth/service.ts';
import { createTestApp as createApp } from './app.ts';
import type { AppServices } from '../app_services.ts';
import { createObjectEnvReader } from '../platform/env.ts';

export const ADMIN_TEST_SESSION_TOKEN = 'test-session';

const TEST_ADMIN_SESSION: AdminAuthSession = {
  user: {
    id: 'test-admin-user',
    email: 'admin@example.test',
    name: 'Test Admin',
  },
};

export function createAdminTestApp(services: Partial<AppServices> = {}) {
  const { env: explicitEnv, ...restServices } = services;

  const app = createApp({
    adminAuth: restServices.adminAuth ?? createAuthenticatedAdminAuth(),
    ...restServices,
    ...(explicitEnv
      ? {
          env: createObjectEnvReader({
            ADMIN_AUTH_ALLOW_SIGNUP: '1',
            APP_ORIGIN: explicitEnv.get('APP_ORIGIN') ?? 'http://localhost',
          }),
        }
      : {}),
  });

  return withDefaultAdminSessionCookie(app);
}

/** @deprecated Use createAdminTestApp instead. */
export function createAuthenticatedTestApp(services: Partial<AppServices> = {}) {
  return createAdminTestApp(services);
}

export function createAuthenticatedAdminAuth(): AdminAuthService {
  return createTestAdminAuth({ session: TEST_ADMIN_SESSION });
}

export function createUnauthenticatedAdminAuth(): AdminAuthService {
  return createTestAdminAuth({ session: null });
}

export function createTestAdminAuth(input: {
  session: AdminAuthSession | null;
  duplicateSignupEmail?: string;
  signOutFailure?: AdminAuthFormFailure;
  socialProviders?: ReadonlyArray<AdminAuthSocialProvider>;
  socialSignInFailure?: AdminAuthFormFailure;
}): AdminAuthService {
  let activeSession = input.session;
  const socialProviders = input.socialProviders ?? [];

  return {
    socialProviders,
    handleAuthRequest() {
      return Promise.resolve(new Response('Not found', { status: 404 }));
    },
    getSession(request) {
      if (!hasActiveSessionCookie(request)) {
        return Promise.resolve(null);
      }

      return Promise.resolve(activeSession);
    },
    signIn(signInInput) {
      if (signInInput.email === 'admin@example.test' && signInInput.password === 'password-123') {
        activeSession = TEST_ADMIN_SESSION;
        return Promise.resolve(
          redirectResult(signInInput.returnTo, adminSessionCookieValue(ADMIN_TEST_SESSION_TOKEN)),
        );
      }

      return Promise.resolve(authFailure('Invalid email or password.', 401));
    },
    signUp(signUpInput) {
      if (signUpInput.email === input.duplicateSignupEmail) {
        return Promise.resolve(authFailure('User already exists.', 409));
      }

      activeSession = {
        user: {
          id: 'signed-up-admin',
          email: signUpInput.email,
          name: signUpInput.name,
        },
      };

      return Promise.resolve(
        redirectResult(signUpInput.returnTo, adminSessionCookieValue(ADMIN_TEST_SESSION_TOKEN)),
      );
    },
    startSocialSignIn(signInInput) {
      if (input.socialSignInFailure) {
        return Promise.resolve(input.socialSignInFailure);
      }

      const provider = socialProviders.find((item) => item.id === signInInput.providerId);

      if (!provider) {
        return Promise.resolve(
          authFailure('That sign-in provider is not configured for this Lantern environment.', 503),
        );
      }

      return Promise.resolve(
        redirectResult(
          `https://accounts.google.com/o/oauth2/v2/auth?client_id=test-${provider.id}-client`,
          'better-auth.state=test-state; Path=/; HttpOnly',
        ),
      );
    },
    signOut(signOutInput) {
      if (input.signOutFailure) {
        return Promise.resolve(input.signOutFailure);
      }

      if (!hasActiveSessionCookie(signOutInput.request)) {
        return Promise.resolve(authFailure('Authentication required.', 401));
      }

      activeSession = null;

      return Promise.resolve(
        redirectResult(signOutInput.returnTo, expiredAdminSessionCookieValue()),
      );
    },
  };
}

export function cookieHeaderFromResponse(response: Response): string | null {
  const cookies = response.headers.getSetCookie?.() ?? [];

  if (cookies.length > 0) {
    return cookies.map((cookie) => cookie.split(';')[0] ?? cookie).join('; ');
  }

  const cookie = response.headers.get('set-cookie');

  return cookie ? (cookie.split(';')[0] ?? cookie) : null;
}

function withDefaultAdminSessionCookie(app: ReturnType<typeof createApp>) {
  const request = app.request.bind(app);
  const fetch = app.fetch.bind(app);

  const withSessionCookie = (init?: RequestInit): RequestInit => {
    const headers = new Headers(init?.headers);

    if (!headers.has('cookie') && !headers.has('Cookie')) {
      headers.set('cookie', adminSessionCookieValue(ADMIN_TEST_SESSION_TOKEN));
    }

    return { ...init, headers };
  };

  app.request = (input, init, environment) => {
    return request(input, withSessionCookie(init), environment);
  };

  app.fetch = (input, environment, executionContext) => {
    if (input instanceof Request) {
      const headers = new Headers(input.headers);

      if (!headers.has('cookie') && !headers.has('Cookie')) {
        headers.set('cookie', adminSessionCookieValue(ADMIN_TEST_SESSION_TOKEN));
      }

      const nextRequest = new Request(input, { headers });
      return fetch(nextRequest, environment, executionContext);
    }

    return fetch(input, environment, executionContext);
  };

  return app;
}

function hasActiveSessionCookie(request: Request): boolean {
  const token = readAdminSessionCookie(request);

  return token === ADMIN_TEST_SESSION_TOKEN;
}

function redirectResult(location: string, cookie: string): AdminAuthFormResult {
  return {
    success: true,
    response: new Response(null, {
      status: 303,
      headers: {
        location,
        'set-cookie': cookie,
      },
    }),
  };
}

function authFailure(message: string, status: 401 | 409 | 503): AdminAuthFormFailure {
  return {
    success: false,
    message,
    status,
  };
}
