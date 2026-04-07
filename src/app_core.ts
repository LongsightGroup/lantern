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
import type { AppServices } from './app_services.ts';

export function buildApp(services: AppServices): Hono {
  const app = new Hono();

  app.use('/admin/*', csrf());

  registerBasicRoutes(app, services);
  registerLaunchRoutes(app, services);
  registerDeepLinkingRoutes(app, services);
  registerDeepLinkingSubmitRoutes(app, services);
  registerRuntimeRoutes(app, services);
  registerAdminInventoryRoutes(app, services);
  registerAdminOperationsRoutes(app, services);
  registerAdminPlacementRoutes(app, services);
  registerAdminPreviewRoutes(app, services);
  registerAdminDeploymentDetailRoutes(app, services);
  registerAdminDeploymentOpsRoutes(app, services);
  registerAdminDeploymentRetryRoutes(app, services);

  return app;
}
