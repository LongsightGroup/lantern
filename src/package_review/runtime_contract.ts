import { CompactSign, compactVerify, createLocalJWKSet } from 'jose';
import type { Capability } from '../../sdk/app-sdk.ts';
import { getPublicJwkSet, loadToolSigningKey } from '../lti/tool_key.ts';
import type { ManifestReviewData } from './manifest.ts';
import type { ReviewedRuntimeContract } from './types.ts';

const REVIEWED_RUNTIME_CONTRACT_JWS_TYPE = 'application/lantern-reviewed-runtime-contract+jws';
const RUNTIME_CONTRACT_CAPABILITIES = new Set<Capability>([
  'read_launch_context',
  'read_activity_content',
  'submit_attempt_event',
  'finalize_attempt',
  'read_local_state',
  'write_local_state',
]);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface EnvReader {
  get(name: string): string | undefined;
}

export interface SignedReviewedRuntimeContract {
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
}

export function createReviewedRuntimeContract(input: {
  reviewData: Pick<ManifestReviewData, 'appId' | 'version' | 'entrypoint' | 'capabilities'>;
  artifactDigest: string;
}): ReviewedRuntimeContract {
  return {
    appId: input.reviewData.appId,
    packageVersion: input.reviewData.version,
    artifactDigest: input.artifactDigest,
    entrypoint: input.reviewData.entrypoint,
    capabilities: [...input.reviewData.capabilities],
  };
}

export async function buildSignedReviewedRuntimeContract(input: {
  reviewData: Pick<ManifestReviewData, 'appId' | 'version' | 'entrypoint' | 'capabilities'>;
  artifactDigest: string;
  env?: EnvReader;
}): Promise<SignedReviewedRuntimeContract> {
  const runtimeContract = createReviewedRuntimeContract({
    reviewData: input.reviewData,
    artifactDigest: input.artifactDigest,
  });

  return {
    runtimeContract,
    runtimeContractSignature: await signReviewedRuntimeContract({
      runtimeContract,
      ...(input.env === undefined ? {} : { env: input.env }),
    }),
  };
}

export function parseReviewedRuntimeContract(value: unknown): ReviewedRuntimeContract {
  if (!isObject(value)) {
    throw new Error('Reviewed runtime contract must be an object.');
  }

  return {
    appId: readRequiredString(value, 'appId'),
    packageVersion: readRequiredString(value, 'packageVersion'),
    artifactDigest: readRequiredString(value, 'artifactDigest'),
    entrypoint: readRequiredString(value, 'entrypoint'),
    capabilities: readCapabilities(value.capabilities),
  };
}

export async function verifyReviewedRuntimeContractSignature(input: {
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
  env?: EnvReader;
}): Promise<void> {
  try {
    const verified = await compactVerify(
      input.runtimeContractSignature,
      createLocalJWKSet(await getPublicJwkSet(input.env ?? Deno.env)),
    );

    if (verified.protectedHeader.typ !== REVIEWED_RUNTIME_CONTRACT_JWS_TYPE) {
      throw new Error('Reviewed runtime contract used the wrong signature type.');
    }

    const payload = textDecoder.decode(verified.payload);
    const signedRuntimeContract = parseReviewedRuntimeContract(JSON.parse(payload));

    if (
      serializeReviewedRuntimeContract(signedRuntimeContract) !==
      serializeReviewedRuntimeContract(input.runtimeContract)
    ) {
      throw new Error('Reviewed runtime contract payload drifted.');
    }
  } catch {
    throw new Error('Runtime contract integrity check failed.');
  }
}

async function signReviewedRuntimeContract(input: {
  runtimeContract: ReviewedRuntimeContract;
  env?: EnvReader;
}): Promise<string> {
  const toolKey = await loadToolSigningKey(input.env ?? Deno.env);

  return await new CompactSign(
    textEncoder.encode(serializeReviewedRuntimeContract(input.runtimeContract)),
  )
    .setProtectedHeader({
      alg: toolKey.privateJwk.alg,
      kid: toolKey.publicJwk.kid,
      typ: REVIEWED_RUNTIME_CONTRACT_JWS_TYPE,
    })
    .sign(toolKey.privateKey);
}

function serializeReviewedRuntimeContract(runtimeContract: ReviewedRuntimeContract): string {
  return JSON.stringify({
    appId: runtimeContract.appId,
    packageVersion: runtimeContract.packageVersion,
    artifactDigest: runtimeContract.artifactDigest,
    entrypoint: runtimeContract.entrypoint,
    capabilities: [...runtimeContract.capabilities],
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];

  if (typeof field !== 'string' || field.length === 0) {
    throw new Error(`Reviewed runtime contract is missing ${key}.`);
  }

  return field;
}

function readCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Reviewed runtime contract capabilities must be a non-empty array.');
  }

  return value.map((capability) => {
    if (
      typeof capability !== 'string' ||
      !RUNTIME_CONTRACT_CAPABILITIES.has(capability as Capability)
    ) {
      throw new Error('Reviewed runtime contract capabilities must use supported values.');
    }

    return capability as Capability;
  });
}
