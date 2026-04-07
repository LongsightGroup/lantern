import type { Hono } from '@hono/hono';
import { buildApp } from './app_core.ts';
import { type AppServices, resolveServices } from './app_services.ts';
import { installDenoEnvReader } from './platform/deno_env.ts';

export type { AppServices } from './app_services.ts';

installDenoEnvReader();

export const app = createApp();

export function createApp(services: Partial<AppServices> = {}): Hono {
  return buildApp(resolveServices(services));
}
