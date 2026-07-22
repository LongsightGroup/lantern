import type { Hono } from '@hono/hono';
import { buildApp } from '../app_core.ts';
import { type AppServices, resolveTestServices } from '../app_services.ts';
import { installDenoEnvReader } from '../platform/deno_env.ts';

installDenoEnvReader();

export function createTestApp(services: Partial<AppServices> = {}): Hono {
  return buildApp(resolveTestServices(services), {
    kernelAdminContext: services.getLmsKernelRepository !== undefined,
  });
}
