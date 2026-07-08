import {
  createNoopLogger,
  type DynamicRegistrationConfig,
  importLtiToolKeyPairFromJwk,
  LtiDynamicRegistration,
  type LtiLogger,
  type LTIStorage,
  LTITool,
  upsertLaunchRegistration,
} from '@longsightgroup/lti-tool';
import { D1Storage } from '@longsightgroup/lti-tool/storage/d1';
import { MemoryStorage } from '@longsightgroup/lti-tool/storage/memory';
import type { AnyD1Database } from 'drizzle-orm/d1';
import { type D1Database } from '../db/d1.ts';
import { type EnvReader, readEnv } from '../platform/env.ts';
import { requireAppOrigin } from './config.ts';
import {
  resolveAuthorizationEndpoint,
  resolveBindingJwksUrl,
  resolveServiceTokenEndpoint,
} from './platform_binding.ts';
import { loadToolSigningKey } from './tool_key.ts';
import type { DeploymentBinding } from './types.ts';

const LTI_STATE_SECRET_ENV = 'LTI_STATE_SECRET';
const MIN_STATE_SECRET_BYTES = 32;

export interface LanternLtiToolContext {
  readonly storage: LTIStorage;
  readonly tool: LTITool;
  readonly dynamicRegistration: LtiDynamicRegistration;
  readonly logger: LtiLogger;
}

export interface LanternLtiToolContextInput {
  readonly env: EnvReader;
  readonly storage: LTIStorage;
  readonly appOrigin?: string;
  readonly logger?: LtiLogger;
}

export function createD1LtiStorage(database: D1Database, logger?: LtiLogger): LTIStorage {
  return new D1Storage({
    // SAFETY: Cloudflare's D1 binding satisfies the runtime query surface expected by drizzle-orm/d1.
    database: database as unknown as AnyD1Database,
    ...(logger === undefined ? {} : { logger }),
  });
}

export function createMemoryLtiStorage(logger?: LtiLogger): LTIStorage {
  return new MemoryStorage(logger === undefined ? {} : { logger });
}

export async function createLanternLtiToolContext(
  input: LanternLtiToolContextInput,
): Promise<LanternLtiToolContext> {
  const logger = input.logger ?? createNoopLogger();
  const toolSigningKey = await loadToolSigningKey(input.env);
  const keyMaterial = await importLtiToolKeyPairFromJwk(toolSigningKey.privateJwk);
  const appOrigin = input.appOrigin ?? requireAppOrigin(input.env);
  const config = {
    stateSecret: readLtiStateSecret(input.env),
    keyPair: keyMaterial.keyPair,
    storage: input.storage,
    logger,
    security: {
      keyId: keyMaterial.keyId,
      remoteJwks: {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 300_000,
      },
    },
    dynamicRegistration: buildDynamicRegistrationConfig(appOrigin),
  };

  return {
    storage: input.storage,
    tool: new LTITool(config),
    dynamicRegistration: new LtiDynamicRegistration(config),
    logger,
  };
}

export async function syncLtiToolDeploymentBinding(input: {
  readonly storage: LTIStorage;
  readonly appTitle: string;
  readonly deploymentSlug: string;
  readonly binding: DeploymentBinding;
}): Promise<void> {
  await upsertLaunchRegistration(input.storage, {
    iss: input.binding.issuer,
    clientId: input.binding.clientId,
    deploymentId: input.binding.deploymentId,
    authUrl: resolveAuthorizationEndpoint(input.binding),
    tokenUrl: resolveServiceTokenEndpoint(input.binding),
    jwksUrl: resolveBindingJwksUrl(input.binding),
    name: `${input.appTitle} via Lantern`,
    deploymentName: input.deploymentSlug,
  });
}

function readLtiStateSecret(env: EnvReader): Uint8Array {
  const rawValue = readEnv(LTI_STATE_SECRET_ENV, env)?.trim();

  if (!rawValue) {
    throw new Error(
      `Missing ${LTI_STATE_SECRET_ENV}. Lantern needs a stable secret of at least ${MIN_STATE_SECRET_BYTES} bytes for LTI OIDC state signing.`,
    );
  }

  const bytes = new TextEncoder().encode(rawValue);

  if (bytes.byteLength < MIN_STATE_SECRET_BYTES) {
    throw new Error(
      `${LTI_STATE_SECRET_ENV} must be at least ${MIN_STATE_SECRET_BYTES} UTF-8 bytes.`,
    );
  }

  return bytes;
}

function buildDynamicRegistrationConfig(appOrigin: string): DynamicRegistrationConfig {
  return {
    url: appOrigin,
    name: 'Lantern',
    description: 'Launch approved Lantern learning activities through the governed runtime.',
    loginUri: `${appOrigin}/lti/login`,
    launchUri: `${appOrigin}/lti/launch`,
    jwksUri: `${appOrigin}/lti/jwks.json`,
    deepLinkingUri: `${appOrigin}/lti/deep-linking`,
    redirectUris: [
      `${appOrigin}/lti/launch`,
      `${appOrigin}/lti/deep-linking`,
      `${appOrigin}/lti/deep-linking?placement=resource_selection`,
    ],
    platforms: {
      canvas: {
        privacyLevel: 'public',
        toolId: 'lantern-demo-broker',
        resourceLinkPlacements: ['course_navigation'],
        deepLinkPlacements: ['assignment_selection', 'resource_selection'],
      },
      moodle: {
        deepLinkPlacements: ['assignment_selection'],
      },
      sakai: {
        resourceLinkPlacements: ['course_navigation'],
        deepLinkPlacements: ['assignment_selection'],
      },
    },
  };
}
