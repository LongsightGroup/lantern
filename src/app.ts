import { csrf } from '@hono/hono/csrf';
import { Hono } from '@hono/hono';
import { registerAdminDeploymentDetailRoutes } from './app_admin_deployment_detail_routes.ts';
import { registerAdminDeploymentOpsRoutes } from './app_admin_deployment_ops_routes.ts';
import { registerAdminDeploymentRetryRoutes } from './app_admin_deployment_retry_routes.ts';
import { registerAdminInventoryRoutes } from './app_admin_inventory_routes.ts';
import { registerAdminOperationsRoutes } from './app_admin_operations_routes.ts';
import { registerAdminPlacementRoutes } from './app_admin_placement_routes.ts';
import { registerAdminPreviewRoutes } from './app_admin_preview_routes.ts';
import { registerBasicRoutes } from './app_basic_routes.ts';
import { registerDeepLinkingRoutes } from './app_deep_linking_routes.ts';
import { registerDeepLinkingSubmitRoutes } from './app_deep_linking_submit_routes.ts';
import { registerLaunchRoutes } from './app_launch_routes.ts';
import { registerRuntimeRoutes } from './app_runtime_routes.ts';
import { type AppServices, resolveServices } from './app_services.ts';

export type { AppServices } from './app_services.ts';

export const app = createApp();

export function createApp(services: Partial<AppServices> = {}): Hono {
  const resolvedServices = resolveServices(services);
  const app = new Hono();

  app.use('/admin/*', csrf());

  registerBasicRoutes(app);
  registerLaunchRoutes(app, resolvedServices);
  registerDeepLinkingRoutes(app, resolvedServices);
  registerDeepLinkingSubmitRoutes(app, resolvedServices);
  registerRuntimeRoutes(app, resolvedServices);
  registerAdminInventoryRoutes(app, resolvedServices);
  registerAdminOperationsRoutes(app, resolvedServices);
  registerAdminPlacementRoutes(app, resolvedServices);
  registerAdminPreviewRoutes(app, resolvedServices);
  registerAdminDeploymentDetailRoutes(app, resolvedServices);
  registerAdminDeploymentOpsRoutes(app, resolvedServices);
  registerAdminDeploymentRetryRoutes(app, resolvedServices);

  return app;
}
