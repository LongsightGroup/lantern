import { type EnvReader, readEnv } from '../platform/env.ts';
import { normalizePublicOrigin } from '../public_origin.ts';

const APP_ORIGIN_ENV = 'APP_ORIGIN';

/** Resolves Lantern's configured public origin for LTI protocol URLs. */
export function requireAppOrigin(env?: EnvReader): string {
  const appOrigin = readEnv(APP_ORIGIN_ENV, env)?.trim();
  if (!appOrigin) {
    throw new Error(`${APP_ORIGIN_ENV} is required to publish Lantern's LTI URLs.`);
  }
  return normalizePublicOrigin(appOrigin);
}
