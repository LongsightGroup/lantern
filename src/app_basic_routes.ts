import type { Hono } from '@hono/hono';
import type { AppServices } from './app_services.ts';
import { renderHomePage } from './pages/home.ts';
import { buildCanvasConfigDocument } from './lti/config.ts';
import { getPublicJwkSet } from './lti/tool_key.ts';
import { statusForError } from './app_status_support.ts';
import { readEnv } from './platform/env.ts';
import { resolveConfiguredPublicOrigin } from './public_origin.ts';

const APP_WRITER_HARNESS = 'workspace-runner-v1';

export function registerBasicRoutes(app: Hono, services: AppServices): void {
  app.get('/', (context) => {
    return context.html(renderHomePage());
  });

  app.get('/health', (context) => {
    return context.json({ ok: true, appWriterHarness: APP_WRITER_HARNESS });
  });

  app.get('/lti/canvas/config.json', async (context) => {
    try {
      return context.json(
        await buildCanvasConfigDocument(
          resolveConfiguredPublicOrigin({
            requestUrl: context.req.url,
            forwardedHeader: context.req.header('forwarded') ?? null,
            xForwardedHost: context.req.header('x-forwarded-host') ?? null,
            xForwardedProto: context.req.header('x-forwarded-proto') ?? null,
            configuredOrigin: readEnv('APP_ORIGIN', services.env),
          }),
          services.env,
        ),
      );
    } catch (error) {
      return context.json(
        {
          error: error instanceof Error ? error.message : 'Config unavailable.',
        },
        statusForError(error),
      );
    }
  });

  app.get('/lti/jwks.json', async (context) => {
    try {
      return context.json(await getPublicJwkSet(services.env));
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'JWKS unavailable.' },
        statusForError(error),
      );
    }
  });
}
