import type { Context, Next } from '@hono/hono';

type LanternHonoHandler = (
  context: Context,
  next: Next,
) => Response | Promise<Response>;

export function adaptLtiToolHonoHandler(handler: unknown): LanternHonoHandler {
  // lti-tool publishes handlers against npm:hono while Lantern imports Hono from JSR.
  // Keep the dependency-source bridge in one adapter instead of route code.
  return handler as LanternHonoHandler;
}
