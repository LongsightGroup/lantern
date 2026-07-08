import type { Context } from '@hono/hono';
import type { AdminIdentity } from '../admin/layout_support.ts';
import type { AdminAuthSession } from './service.ts';

export const ADMIN_SESSION_KEY = 'adminSession';

export function setAdminSession(context: Context, session: AdminAuthSession): void {
  context.set(ADMIN_SESSION_KEY, session);
}

export function getAdminSession(context: Context): AdminAuthSession {
  const session = context.get(ADMIN_SESSION_KEY);

  if (!session) {
    throw new Error('Protected admin route reached without an authenticated session.');
  }

  return session;
}

export function adminIdentityFromSession(session: AdminAuthSession): AdminIdentity {
  const displayName = session.user.name.trim() || session.user.email;

  return {
    displayName,
    detail: session.user.email,
  };
}

export function adminIdentityFromContext(context: Context): AdminIdentity {
  return adminIdentityFromSession(getAdminSession(context));
}
