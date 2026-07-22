import {
  createNoopLogger,
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
import { loadToolSigningKey } from './tool_key.ts';
import type { LmsConnectionRecord } from '../lms_kernel/types.ts';

/**
 * Data ownership boundary for LTI:
 *
 * - `lms_connections` (owned by lms_kernel) is Lantern's product identity for an
 *   institution's LMS platform. It is the source of truth an admin manages.
 * - The `lti_*` tables written through {@link LTIStorage} are an ephemeral
 *   protocol registration cache consumed only by the `@longsightgroup/lti-tool`
 *   library to run the OIDC/launch handshake. They are derived from
 *   `lms_connections` and can be rebuilt from it at any time.
 *
 * {@link syncLtiToolConnection} projects a product `lms_connections` record into
 * that protocol cache. Never treat the `lti_*` tables as authoritative.
 */

const LTI_STATE_SECRET_ENV = 'LTI_STATE_SECRET';
const MIN_STATE_SECRET_BYTES = 32;

export interface LanternLtiToolContext {
  readonly storage: LTIStorage;
  readonly tool: LTITool;
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
  if (input.appOrigin === undefined) {
    requireAppOrigin(input.env);
  }
  const config = {
    stateSecret: readLtiStateSecret(input.env),
    keyPair: toolSigningKey.keyPair,
    storage: input.storage,
    logger,
    security: {
      keyId: toolSigningKey.keyId,
      remoteJwks: {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 300_000,
      },
    },
  };

  return {
    storage: input.storage,
    tool: new LTITool(config),
    logger,
  };
}

/**
 * Projects a product `lms_connections` record into the lti-tool protocol
 * registration cache. `lms_connections` remains the owner; this only refreshes
 * the derived `lti_*` registration the library needs to complete launches.
 */
export async function syncLtiToolConnection(input: {
  readonly storage: LTIStorage;
  readonly connection: LmsConnectionRecord;
}): Promise<void> {
  await upsertLaunchRegistration(input.storage, {
    iss: input.connection.issuer,
    clientId: input.connection.clientId,
    deploymentId: input.connection.deploymentId,
    authUrl: input.connection.authorizationEndpoint,
    tokenUrl: input.connection.accessTokenUrl,
    jwksUrl: input.connection.jwksUrl,
    name: `${input.connection.label} via Lantern`,
    deploymentName: input.connection.id,
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
