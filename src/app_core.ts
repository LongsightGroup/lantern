import { csrf } from 'hono/csrf';
import { Hono } from 'hono';
import { registerAdminAppWriterRoutes } from './app_admin_app_writer_routes.ts';
import {
  registerProtectedAdminAuthRoutes,
  registerPublicAdminAuthRoutes,
} from './app_admin_auth_routes.ts';
import { registerAdminAuthoringRoutes } from './app_admin_authoring_routes.ts';
import { registerAdminAuthoringPreviewRoutes } from './app_admin_authoring_preview_routes.ts';
import { registerAdminInventoryRoutes } from './app_admin_inventory_routes.ts';
import { registerAdminPreviewRoutes } from './app_admin_preview_routes.ts';
import { registerBasicRoutes } from './app_basic_routes.ts';
import { registerLaunchRoutes } from './app_launch_routes.ts';
import { registerPythonLabRoutes } from './app_python_lab_routes.ts';
import { registerAdminPythonLabRoutes } from './app_admin_python_lab_routes.ts';
import { registerLmsKernelRoutes } from './app_lms_kernel_routes.ts';
import { registerGovernedRuntimeRoutes } from './app_governed_runtime_routes.ts';
import { registerRuntimeRoutes } from './app_runtime_routes.ts';
import { createAdminAuthMiddleware } from './admin_auth/middleware.ts';
import { createKernelAdminContextMiddleware } from './lms_kernel/admin_middleware.ts';
import { registerAdminGovernanceRoutes } from './app_admin_governance_routes.ts';
import type { AppServices } from './app_services.ts';

export function buildApp(
  services: AppServices,
  options: { readonly kernelAdminContext: boolean },
): Hono {
  const app = new Hono();

  registerBasicRoutes(app, services);
  registerLaunchRoutes(app, services);
  registerGovernedRuntimeRoutes(app, services);
  registerRuntimeRoutes(app, services);
  registerLmsKernelRoutes(app, services);
  app.use('/autograder/*', csrf());
  registerPythonLabRoutes(app, services);

  registerPublicAdminAuthRoutes(app, services);

  app.use('/admin/*', createAdminAuthMiddleware(services));
  if (options.kernelAdminContext) {
    app.use('/admin/*', createKernelAdminContextMiddleware(services));
  }
  app.use('/admin/*', csrf());

  registerProtectedAdminAuthRoutes(app, services);
  registerAdminGovernanceRoutes(app, services);
  registerAdminAppWriterRoutes(app, services);
  registerAdminInventoryRoutes(app, services);
  registerAdminAuthoringRoutes(app, services);
  registerAdminAuthoringPreviewRoutes(app, services);
  registerAdminPreviewRoutes(app, services);
  registerAdminPythonLabRoutes(app, services);

  return app;
}
