import { resolveCanvasPlatformBinding } from '@longsightgroup/lti-tool';
import type { CanvasEnvironment, CanvasPlatformConfig } from './types.ts';

const CANVAS_PLATFORMS: Record<CanvasEnvironment, CanvasPlatformConfig> = {
  production: buildCanvasPlatformConfig('production'),
  beta: buildCanvasPlatformConfig('beta'),
  test: buildCanvasPlatformConfig('test'),
};

export function listCanvasPlatforms(): CanvasPlatformConfig[] {
  return [CANVAS_PLATFORMS.production, CANVAS_PLATFORMS.beta, CANVAS_PLATFORMS.test];
}

export function resolveCanvasPlatform(value: CanvasEnvironment | string): CanvasPlatformConfig {
  if (value === 'production' || value === 'beta' || value === 'test') {
    return CANVAS_PLATFORMS[value];
  }

  const byIssuer = listCanvasPlatforms().find((platform) => platform.issuer === value);

  if (byIssuer) {
    return byIssuer;
  }

  throw new Error(`Canvas issuer ${value} is not supported by Lantern.`);
}

function buildCanvasPlatformConfig(environment: CanvasEnvironment): CanvasPlatformConfig {
  const binding = resolveCanvasPlatformBinding(environment);

  return {
    environment,
    issuer: binding.iss,
    authorizationEndpoint: binding.authUrl,
    jwksUrl: binding.jwksUrl,
  };
}
