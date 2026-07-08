import type { EnvReader } from '../platform/env.ts';
import { readEnv } from '../platform/env.ts';

const BETTER_AUTH_SECRET_ENV = 'BETTER_AUTH_SECRET';
const APP_ORIGIN_ENV = 'APP_ORIGIN';
const ADMIN_AUTH_ALLOW_SIGNUP_ENV = 'ADMIN_AUTH_ALLOW_SIGNUP';
const GOOGLE_CLIENT_ID_ENV = 'GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET_ENV = 'GOOGLE_CLIENT_SECRET';

export type AdminAuthSocialProviderId = 'google';

export interface AdminAuthSocialProvider {
  readonly id: AdminAuthSocialProviderId;
  readonly label: string;
}

export interface AdminAuthSocialProviderConfig extends AdminAuthSocialProvider {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AdminAuthConfig {
  readonly baseURL: string;
  readonly secret: string;
  readonly allowSignUp: boolean;
  readonly socialProviders: ReadonlyArray<AdminAuthSocialProviderConfig>;
}

export function readAdminAuthConfig(env: EnvReader): AdminAuthConfig {
  return {
    baseURL: readRequiredEnv(env, APP_ORIGIN_ENV),
    secret: readRequiredEnv(env, BETTER_AUTH_SECRET_ENV),
    allowSignUp: readEnv(ADMIN_AUTH_ALLOW_SIGNUP_ENV, env) === '1',
    socialProviders: readAdminAuthSocialProviderConfigs(env),
  };
}

export function publicAdminAuthSocialProviders(
  providers: ReadonlyArray<AdminAuthSocialProviderConfig>,
): ReadonlyArray<AdminAuthSocialProvider> {
  return providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
  }));
}

function readAdminAuthSocialProviderConfigs(
  env: EnvReader,
): ReadonlyArray<AdminAuthSocialProviderConfig> {
  const google = readGoogleProviderConfig(env);

  return google === undefined ? [] : [google];
}

function readGoogleProviderConfig(env: EnvReader): AdminAuthSocialProviderConfig | undefined {
  const clientId = readEnv(GOOGLE_CLIENT_ID_ENV, env)?.trim();
  const clientSecret = readEnv(GOOGLE_CLIENT_SECRET_ENV, env)?.trim();

  if (!clientId && !clientSecret) {
    return undefined;
  }

  if (!clientId) {
    throw new Error(`${GOOGLE_CLIENT_ID_ENV} is required when Google admin sign-in is enabled.`);
  }

  if (!clientSecret) {
    throw new Error(
      `${GOOGLE_CLIENT_SECRET_ENV} is required when Google admin sign-in is enabled.`,
    );
  }

  return {
    id: 'google',
    label: 'Google',
    clientId,
    clientSecret,
  };
}

function readRequiredEnv(env: EnvReader, name: string): string {
  const value = readEnv(name, env)?.trim();

  if (!value) {
    throw new Error(`${name} is required to enable Lantern admin authentication.`);
  }

  return value;
}
