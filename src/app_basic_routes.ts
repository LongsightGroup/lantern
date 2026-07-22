import type { Hono } from '@hono/hono';
import type { AppServices } from './app_services.ts';
import { renderHomePage } from './pages/home.ts';
import { statusForError } from './app_status_support.ts';
import { resolveRequestAppOrigin } from './app_origin.ts';

const APP_WRITER_HARNESS = 'workspace-runner-v1';

export function registerBasicRoutes(app: Hono, services: AppServices): void {
  app.get('/', (context) => {
    return context.html(renderHomePage());
  });

  app.get('/health', (context) => {
    return context.json({ ok: true, appWriterHarness: APP_WRITER_HARNESS });
  });

  app.get('/lti/jwks', async (context) => {
    try {
      const ltiContext = await services.getLtiToolContext(
        resolveRequestAppOrigin(context, services.env),
      );

      return context.json(await ltiContext.tool.getJWKS());
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'JWKS unavailable.' },
        statusForError(error),
      );
    }
  });

  app.get('/lti/jwks.json', async (context) => {
    try {
      const ltiContext = await services.getLtiToolContext(
        resolveRequestAppOrigin(context, services.env),
      );

      return context.json(await ltiContext.tool.getJWKS());
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'JWKS unavailable.' },
        statusForError(error),
      );
    }
  });
}
