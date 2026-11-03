import type { MiddlewareHandler } from 'hono';
import type { AppServices } from '../app_services.ts';
import { setAdminSession } from './context.ts';

export function createAdminAuthMiddleware(services: AppServices): MiddlewareHandler {
  return async (context, next) => {
    const session = await services.adminAuth.getSession(context.req.raw);

    if (session) {
      setAdminSession(context, session);
      await next();
      return;
    }

    if (wantsHtml(context.req.raw)) {
      const url = new URL(context.req.raw.url);
      const returnTo = `${url.pathname}${url.search}`;
      return context.redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`, 303);
    }

    return context.text('Authentication required.', 401);
  };
}

function wantsHtml(request: Request): boolean {
  const accept = request.headers.get('accept')?.toLowerCase();

  if (!accept) {
    return true;
  }

  if (accept.includes('application/json') || accept.includes('application/problem+json')) {
    return false;
  }

  return accept.includes('text/html');
}
