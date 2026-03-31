import type { Hono } from "@hono/hono";
import type { AppServices } from "./app_services.ts";
import { registerAdminDeploymentRosterRoute } from "./app_admin_deployment_roster_route.ts";
import { registerAdminGradeSmokeRoute } from "./app_admin_grade_smoke_route.ts";

export function registerAdminDeploymentOpsRoutes(
  app: Hono,
  services: AppServices,
): void {
  registerAdminDeploymentRosterRoute(app, services);
  registerAdminGradeSmokeRoute(app, services);
}
