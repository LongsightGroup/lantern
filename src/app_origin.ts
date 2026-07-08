import type { Context } from '@hono/hono';
import { type EnvReader, readEnv } from './platform/env.ts';
import { resolveConfiguredPublicOrigin } from './public_origin.ts';

export function resolveRequestAppOrigin(context: Context, env: EnvReader): string {
  return resolveConfiguredPublicOrigin({
    requestUrl: context.req.url,
    forwardedHeader: context.req.header('forwarded') ?? null,
    xForwardedHost: context.req.header('x-forwarded-host') ?? null,
    xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
    configuredOrigin: readEnv('APP_ORIGIN', env),
  });
}
