import { betterAuth, type BetterAuthOptions } from 'better-auth';
import type { D1Database } from '../db/d1.ts';
import type { EnvReader } from '../platform/env.ts';
import { readEnv } from '../platform/env.ts';

const BETTER_AUTH_SECRET_ENV = 'BETTER_AUTH_SECRET';
const APP_ORIGIN_ENV = 'APP_ORIGIN';
const ADMIN_AUTH_ALLOW_SIGNUP_ENV = 'ADMIN_AUTH_ALLOW_SIGNUP';
const ADMIN_SESSION_COOKIE = 'better-auth.session_token';

export interface AdminAuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AdminAuthSession {
  user: AdminAuthUser;
}

export interface AdminAuthFormResult {
  success: true;
  response: Response;
}

export interface AdminAuthFormFailure {
  success: false;
  message: string;
  status: 400 | 401 | 409 | 500 | 503;
}

export type AdminAuthFormOutcome = AdminAuthFormResult | AdminAuthFormFailure;

export interface AdminAuthService {
  handleAuthRequest(request: Request): Promise<Response>;
  getSession(request: Request): Promise<AdminAuthSession | null>;
  signIn(input: {
    request: Request;
    email: string;
    password: string;
    returnTo: string;
  }): Promise<AdminAuthFormOutcome>;
  signUp(input: {
    request: Request;
    name: string;
    email: string;
    password: string;
    returnTo: string;
  }): Promise<AdminAuthFormOutcome>;
  signOut(input: { request: Request; returnTo: string }): Promise<AdminAuthFormOutcome>;
}

type BetterAuthRuntime = ReturnType<typeof betterAuth>;

export function createBetterAdminAuthOptions(input: {
  db: D1Database;
  baseURL: string;
  secret: string;
  allowSignUp: boolean;
}): BetterAuthOptions {
  return {
    appName: 'Lantern',
    database: input.db,
    baseURL: input.baseURL,
    basePath: '/api/auth',
    secret: input.secret,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !input.allowSignUp,
    },
    user: {
      modelName: 'auth_users',
    },
    session: {
      modelName: 'auth_sessions',
    },
    account: {
      modelName: 'auth_accounts',
    },
    verification: {
      modelName: 'auth_verifications',
    },
  };
}

export function createBetterAdminAuth(input: {
  db: D1Database;
  env: EnvReader;
}): AdminAuthService {
  const baseURL = readRequiredEnv(input.env, APP_ORIGIN_ENV);
  const secret = readRequiredEnv(input.env, BETTER_AUTH_SECRET_ENV);
  const allowSignUp = readEnv(ADMIN_AUTH_ALLOW_SIGNUP_ENV, input.env) === '1';
  const auth = betterAuth(
    createBetterAdminAuthOptions({ db: input.db, baseURL, secret, allowSignUp }),
  );

  return createBetterAuthService(auth);
}

export function createUnconfiguredAdminAuthService(message: string): AdminAuthService {
  return {
    handleAuthRequest() {
      return Promise.resolve(new Response(message, { status: 503 }));
    },
    getSession() {
      return Promise.resolve(null);
    },
    signIn() {
      return Promise.resolve(unconfiguredAuthFailure(message));
    },
    signUp() {
      return Promise.resolve(unconfiguredAuthFailure(message));
    },
    signOut() {
      return Promise.resolve(unconfiguredAuthFailure(message));
    },
  };
}

function createBetterAuthService(auth: BetterAuthRuntime): AdminAuthService {
  return {
    handleAuthRequest(request) {
      return auth.handler(request);
    },
    async getSession(request) {
      const result = await auth.api.getSession({
        headers: request.headers,
      });

      if (!result) {
        return null;
      }

      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
      };
    },
    signIn(input) {
      return runBetterAuthFormAction(
        () =>
          auth.api.signInEmail({
            body: {
              email: input.email,
              password: input.password,
              callbackURL: input.returnTo,
            },
            headers: input.request.headers,
            returnHeaders: true,
          }),
        input.returnTo,
      );
    },
    signUp(input) {
      return runBetterAuthFormAction(
        () =>
          auth.api.signUpEmail({
            body: {
              name: input.name,
              email: input.email,
              password: input.password,
              callbackURL: input.returnTo,
            },
            headers: input.request.headers,
            returnHeaders: true,
          }),
        input.returnTo,
      );
    },
    async signOut(input) {
      return await runBetterAuthFormAction(
        async () => {
          const result = await auth.api.signOut({
            headers: input.request.headers,
            returnHeaders: true,
          });

          if (!result.response.success) {
            throw new Error('Better Auth did not invalidate the admin session.');
          }

          return result;
        },
        input.returnTo,
      );
    },
  };
}

async function runBetterAuthFormAction(
  action: () => Promise<{ headers: Headers }>,
  returnTo: string,
): Promise<AdminAuthFormOutcome> {
  try {
    const authResult = await action();
    return {
      success: true,
      response: redirectWithAuthHeaders(returnTo, authResult.headers),
    };
  } catch (error) {
    return parseBetterAuthFormFailure(error);
  }
}

function parseBetterAuthFormFailure(error: unknown): AdminAuthFormFailure {
  return {
    success: false,
    status: statusForAuthError(error),
    message: authErrorMessage(error),
  };
}

function redirectWithAuthHeaders(location: string, authHeaders: Headers): Response {
  const response = new Response(null, {
    status: 303,
    headers: {
      location,
    },
  });

  copyAuthResponseHeaders(authHeaders, response.headers);

  return response;
}

function copyAuthResponseHeaders(source: Headers, target: Headers): void {
  for (const cookie of getSetCookies(source)) {
    target.append('set-cookie', cookie);
  }
}

function statusForAuthError(error: unknown): 400 | 401 | 409 | 500 {
  const status = readAuthErrorStatus(error);

  if (status === 401 || status === 409 || status === 500) {
    return status;
  }

  return 400;
}

function authErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'body' in error &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'message' in error.body &&
    typeof error.body.message === 'string'
  ) {
    return error.body.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim() !== ''
  ) {
    return error.message;
  }

  return 'Authentication failed.';
}

function readAuthErrorStatus(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status;
  }

  return null;
}

function getSetCookies(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };

  if (typeof withGetter.getSetCookie === 'function') {
    return withGetter.getSetCookie();
  }

  const cookie = headers.get('set-cookie');

  return cookie ? [cookie] : [];
}

function readRequiredEnv(env: EnvReader, name: string): string {
  const value = readEnv(name, env)?.trim();

  if (!value) {
    throw new Error(`${name} is required to enable Lantern admin authentication.`);
  }

  return value;
}

function unconfiguredAuthFailure(message: string): AdminAuthFormFailure {
  return {
    success: false,
    status: 503,
    message,
  };
}

export function readAdminSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');

    if (name === ADMIN_SESSION_COOKIE) {
      const value = valueParts.join('=').trim();
      return value.length > 0 ? value : null;
    }
  }

  return null;
}

export function adminSessionCookieValue(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly`;
}

export function expiredAdminSessionCookieValue(): string {
  return `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly`;
}
