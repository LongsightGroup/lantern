import type { Hono } from '@hono/hono';
import type { AppServices } from './app_services.ts';

type LmsKernelRouteServices = Pick<AppServices, 'protectedMediaService'>;

export function registerLmsKernelRoutes(app: Hono, services: LmsKernelRouteServices): void {
  app.get('/runtime/media/:mediaId', async (context) => {
    return await services.protectedMediaService.fetch({
      mediaId: context.req.param('mediaId'),
      now: new Date(),
    });
  });
}
