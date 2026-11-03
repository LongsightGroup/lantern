import type { Hono } from 'hono';
import { buildApp } from '../app_core.ts';
import { type AppServices, resolveTestServices } from '../app_services.ts';
import { installNodeEnvReader } from '../platform/node_env.ts';

installNodeEnvReader();

export function createTestApp(services: Partial<AppServices> = {}): Hono {
  return buildApp(resolveTestServices(services), {
    kernelAdminContext: services.getLmsKernelRepository !== undefined,
  });
}
