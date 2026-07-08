import {
  buildCanvasStaticRegistrationConfig,
  type CanvasStaticRegistrationConfig,
  type DynamicRegistrationConfig,
} from '@longsightgroup/lti-tool';
import type { CanvasEnvironment } from './types.ts';
import { listCanvasPlatforms, resolveCanvasPlatform } from './canvas_platform.ts';
import { type EnvReader, readEnv } from '../platform/env.ts';
import { normalizePublicOrigin } from '../public_origin.ts';
import { buildDynamicRegistrationConfig } from './dynamic_registration_config.ts';
import { getPublicJwkSet } from './tool_key.ts';

export interface CanvasEnvironmentOption {
  id: CanvasEnvironment;
  label: string;
  issuer: string;
}

export type CanvasConfigDocument = CanvasStaticRegistrationConfig;

const APP_ORIGIN_ENV = 'APP_ORIGIN';

export function requireAppOrigin(env?: EnvReader): string {
  const appOrigin = readEnv(APP_ORIGIN_ENV, env)?.trim();

  if (!appOrigin) {
    throw new Error(
      `${APP_ORIGIN_ENV} is required to publish Lantern's Canvas config and launch URLs.`,
    );
  }

  return normalizePublicOrigin(appOrigin);
}

export function listCanvasEnvironments(): CanvasEnvironmentOption[] {
  return listCanvasPlatforms().map((platform) => ({
    id: platform.environment,
    label: platform.environment === 'production'
      ? 'Production Canvas'
      : platform.environment === 'beta'
      ? 'Beta Canvas'
      : 'Test Canvas',
    issuer: platform.issuer,
  }));
}

export function resolveCanvasIssuer(environment: CanvasEnvironment): string {
  return resolveCanvasPlatform(environment).issuer;
}

export function buildCanvasConfigUrl(appOrigin = requireAppOrigin()): string {
  return `${normalizePublicOrigin(appOrigin)}/lti/canvas/config.json`;
}

export function buildCanvasJwksUrl(appOrigin = requireAppOrigin()): string {
  return `${normalizePublicOrigin(appOrigin)}/lti/jwks.json`;
}

export function buildCanvasLaunchUrl(appOrigin = requireAppOrigin()): string {
  return `${normalizePublicOrigin(appOrigin)}/lti/launch`;
}

export function buildCanvasDeepLinkingUrl(appOrigin = requireAppOrigin()): string {
  return `${normalizePublicOrigin(appOrigin)}/lti/deep-linking`;
}

export async function buildCanvasConfigDocument(
  appOrigin: string,
  env: EnvReader,
): Promise<CanvasConfigDocument> {
  const normalizedOrigin = normalizePublicOrigin(appOrigin);

  await getPublicJwkSet(env);

  return buildCanvasStaticRegistrationDocument(normalizedOrigin);
}

function buildCanvasStaticRegistrationDocument(
  normalizedOrigin: string,
): CanvasConfigDocument {
  const registrationConfig = buildDynamicRegistrationConfig(normalizedOrigin);

  return buildCanvasStaticRegistrationConfig({
    config: buildCanvasStaticRegistrationConfigShape(registrationConfig, normalizedOrigin),
    selectedServices: ['ags', 'nrps', 'deep_linking'],
  });
}

function buildCanvasStaticRegistrationConfigShape(
  registrationConfig: DynamicRegistrationConfig,
  normalizedOrigin: string,
): DynamicRegistrationConfig {
  return {
    ...registrationConfig,
    url: buildCanvasLaunchUrl(normalizedOrigin),
  };
}

export function parseCanvasEnvironment(value: FormDataEntryValue | null): CanvasEnvironment {
  if (value === 'production' || value === 'beta' || value === 'test') {
    return value;
  }

  throw new Error(
    'Choose one supported Canvas environment before you save the deployment binding.',
  );
}
