import type { MiddlewareHandler } from '@hono/hono';
import type { AppServices } from '../app_services.ts';
import { getAdminSession } from '../admin_auth/context.ts';
import { setKernelAdminContext } from './admin_context.ts';

type KernelAdminContextServices = Pick<AppServices, 'getLmsKernelRepository'>;

export function createKernelAdminContextMiddleware(
  services: KernelAdminContextServices,
): MiddlewareHandler {
  return async (context, next) => {
    const session = getAdminSession(context);
    const repository = services.getLmsKernelRepository();
    const memberships = await repository.listMembershipsForUser(session.user.id);
    const path = new URL(context.req.url).pathname;

    if (memberships.length === 0) {
      if (path === '/admin/onboarding' || path.startsWith('/admin/invites/')) {
        await next();
        return;
      }
      return context.redirect('/admin/onboarding', 303);
    }
    if (memberships.length !== 1) {
      return context.text(
        'Institution selection is ambiguous. An administrator must belong to exactly one institution.',
        409,
      );
    }
    const membership = memberships[0];
    if (membership === undefined) {
      return context.text('Institution membership could not be resolved.', 409);
    }
    const institution = await repository.getInstitutionById(membership.institutionId);
    if (institution === null) {
      return context.text('Institution membership is invalid.', 409);
    }
    setKernelAdminContext(context, { institution, membership });
    if (path === '/admin/onboarding') {
      return context.redirect('/admin/governance', 303);
    }
    await next();
  };
}
