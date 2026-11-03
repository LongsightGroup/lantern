import { CompactSign, compactVerify, createLocalJWKSet } from 'jose';
import type { Capability } from '../../sdk/app-sdk.ts';
import { getPublicJwkSet, loadToolSigningKey } from '../lti/tool_key.ts';
import type { EnvReader } from '../platform/env.ts';
import type { ManifestReviewData } from './manifest.ts';
import type { ReviewedRuntimeContract } from './types.ts';

const REVIEWED_RUNTIME_CONTRACT_JWS_TYPE = 'application/lantern-reviewed-runtime-contract+jws';
const RUNTIME_CONTRACT_CAPABILITIES = new Set<Capability>([
  'read_launch_context',
  'read_activity_content',
  'submit_attempt_event',
  'submit_evidence_artifact',
  'finalize_attempt',
  'run_code_submission',
  'read_local_state',
  'write_local_state',
  'lms.roster.members.read',
  'lms.roster.contact.read',
  'lms.roster.profile_photo.read',
]);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface SignedReviewedRuntimeContract {
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
}

export function createReviewedRuntimeContract(input: {
  reviewData: Pick<ManifestReviewData, 'appId' | 'version' | 'runtime' | 'capabilities'>;
  artifactDigest: string;
}): ReviewedRuntimeContract {
  return {
    runtimeContractVersion: '2',
    appId: input.reviewData.appId,
    packageVersion: input.reviewData.version,
    artifactDigest: input.artifactDigest,
    runtime: input.reviewData.runtime,
    capabilities: [...input.reviewData.capabilities],
  };
}

export async function buildSignedReviewedRuntimeContract(input: {
  reviewData: Pick<ManifestReviewData, 'appId' | 'version' | 'runtime' | 'capabilities'>;
  artifactDigest: string;
  env: EnvReader;
}): Promise<SignedReviewedRuntimeContract> {
  const runtimeContract = createReviewedRuntimeContract({
    reviewData: input.reviewData,
    artifactDigest: input.artifactDigest,
  });

  return {
    runtimeContract,
    runtimeContractSignature: await signReviewedRuntimeContract({
      runtimeContract,
      env: input.env,
    }),
  };
}

export function parseReviewedRuntimeContract(value: unknown): ReviewedRuntimeContract {
  if (!isObject(value)) {
    throw new Error('Reviewed runtime contract must be an object.');
  }

  return {
    runtimeContractVersion: readRuntimeContractVersion(value.runtimeContractVersion),
    appId: readRequiredString(value, 'appId'),
    packageVersion: readRequiredString(value, 'packageVersion'),
    artifactDigest: readRequiredString(value, 'artifactDigest'),
    runtime: readRuntime(value.runtime),
    capabilities: readCapabilities(value.capabilities),
  };
}

export async function verifyReviewedRuntimeContractSignature(input: {
  runtimeContract: ReviewedRuntimeContract;
  runtimeContractSignature: string;
  env: EnvReader;
}): Promise<void> {
  try {
    const verified = await compactVerify(
      input.runtimeContractSignature,
      createLocalJWKSet(await getPublicJwkSet(input.env)),
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
  env: EnvReader;
}): Promise<string> {
  const toolKey = await loadToolSigningKey(input.env);

  return await new CompactSign(
    textEncoder.encode(serializeReviewedRuntimeContract(input.runtimeContract)),
  )
    .setProtectedHeader({
      alg: toolKey.alg,
      kid: toolKey.keyId,
      typ: REVIEWED_RUNTIME_CONTRACT_JWS_TYPE,
    })
    .sign(toolKey.privateKey);
}

function serializeReviewedRuntimeContract(runtimeContract: ReviewedRuntimeContract): string {
  return JSON.stringify({
    runtimeContractVersion: runtimeContract.runtimeContractVersion,
    appId: runtimeContract.appId,
    packageVersion: runtimeContract.packageVersion,
    artifactDigest: runtimeContract.artifactDigest,
    runtime: runtimeContract.runtime,
    capabilities: [...runtimeContract.capabilities],
  });
}

function readRuntimeContractVersion(value: unknown): '2' {
  if (value !== '2') {
    throw new Error('Reviewed runtime contract version must be "2".');
  }
  return value;
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

function readRuntime(value: unknown): ReviewedRuntimeContract['runtime'] {
  if (!isObject(value)) {
    throw new Error('Reviewed runtime contract runtime must be an object.');
  }
  const kind = readRequiredString(value, 'kind');
  const entrypoint = readRequiredString(value, 'entrypoint');
  if (kind !== 'browser' && kind !== 'worker') {
    throw new Error('Reviewed runtime contract runtime kind is unsupported.');
  }
  return { kind, entrypoint };
}
