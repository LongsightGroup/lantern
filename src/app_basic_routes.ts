import type { Hono } from '@hono/hono';
import { renderHomePage } from './pages/home.ts';
import { buildCanvasConfigDocument } from './lti/config.ts';
import { getPublicJwkSet } from './lti/tool_key.ts';
import { statusForError } from './app_status_support.ts';

export function registerBasicRoutes(app: Hono): void {
  app.get('/', (context) => {
    return context.html(renderHomePage());
  });

  app.get('/health', (context) => {
    return context.json({ ok: true });
  });

  app.get('/lti/canvas/config.json', async (context) => {
    try {
      return context.json(await buildCanvasConfigDocument());
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
      return context.json(await getPublicJwkSet());
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : 'JWKS unavailable.' },
        statusForError(error),
      );
    }
  });
}
