import { importLtiToolKeyPairFromJwk, type LtiToolPublicJwk } from '@longsightgroup/lti-tool';
import type { EnvReader } from '../platform/env.ts';

const TOOL_PRIVATE_JWK_ENV = 'LTI_TOOL_PRIVATE_JWK';

export interface LoadedToolSigningKey {
  keyPair: CryptoKeyPair;
  privateKey: CryptoKey;
  keyId: string;
  alg: 'RS256';
  publicJwk: LtiToolPublicJwk;
}

/** Loads the raw private JWK string used by Lantern and LTI Tool. */
export function readToolPrivateJwkValue(env: EnvReader): string {
  const rawValue = env.get(TOOL_PRIVATE_JWK_ENV);

  if (!rawValue) {
    throw new Error(
      `Missing ${TOOL_PRIVATE_JWK_ENV}. Lantern needs one RSA private JWK to publish its Canvas-facing public key and sign Canvas service assertions.`,
    );
  }

  return rawValue;
}

export async function loadToolSigningKey(env: EnvReader): Promise<LoadedToolSigningKey> {
  const keyMaterial = await importLtiToolKeyPairFromJwk(readToolPrivateJwkValue(env));

  return {
    keyPair: keyMaterial.keyPair,
    privateKey: keyMaterial.keyPair.privateKey,
    keyId: keyMaterial.keyId,
    alg: 'RS256',
    publicJwk: keyMaterial.publicJwk,
  };
}

export async function getPublicJwkSet(env: EnvReader): Promise<{ keys: LtiToolPublicJwk[] }> {
  const toolKey = await loadToolSigningKey(env);

  return {
    keys: [toolKey.publicJwk],
  };
}
