import { calculateJwkThumbprint, importJWK } from "jose";

const TOOL_PRIVATE_JWK_ENV = "LTI_TOOL_PRIVATE_JWK";

export interface ToolPublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  alg: "ES256";
  use: "sig";
  kid: string;
}

export interface ToolPrivateJwk extends ToolPublicJwk {
  d: string;
}

export interface LoadedToolSigningKey {
  privateKey: CryptoKey;
  privateJwk: ToolPrivateJwk;
  publicJwk: ToolPublicJwk;
}

interface EnvReader {
  get(name: string): string | undefined;
}

export async function loadToolSigningKey(
  env: EnvReader = Deno.env,
): Promise<LoadedToolSigningKey> {
  const rawValue = env.get(TOOL_PRIVATE_JWK_ENV);

  if (!rawValue) {
    throw new Error(
      `Missing ${TOOL_PRIVATE_JWK_ENV}. Lantern needs one private JWK to publish its Canvas-facing public key.`,
    );
  }

  const privateJwk = await parseToolPrivateJwk(rawValue);
  const importedKey = await importJWK(privateJwk, privateJwk.alg);

  if (!(importedKey instanceof CryptoKey) || importedKey.type !== "private") {
    throw new Error(
      `${TOOL_PRIVATE_JWK_ENV} must contain a private signing key, not a public-only JWK.`,
    );
  }

  return {
    privateKey: importedKey,
    privateJwk,
    publicJwk: toPublicJwk(privateJwk),
  };
}

export async function getPublicJwkSet(
  env: EnvReader = Deno.env,
): Promise<{ keys: ToolPublicJwk[] }> {
  const toolKey = await loadToolSigningKey(env);

  return {
    keys: [toolKey.publicJwk],
  };
}

async function parseToolPrivateJwk(rawValue: string): Promise<ToolPrivateJwk> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(
      `${TOOL_PRIVATE_JWK_ENV} must be valid JSON containing one EC private JWK.`,
    );
  }

  if (!isObject(parsed)) {
    throw new Error(
      `${TOOL_PRIVATE_JWK_ENV} must decode to a JSON object.`,
    );
  }

  const baseJwk = {
    kty: "EC" as const,
    crv: "P-256" as const,
    x: readRequiredString(parsed, "x"),
    y: readRequiredString(parsed, "y"),
    d: readRequiredString(parsed, "d"),
  };
  readRequiredString(parsed, "kty", "EC");
  readRequiredString(parsed, "crv", "P-256");

  const unsignedPublicJwk = {
    kty: baseJwk.kty,
    crv: baseJwk.crv,
    x: baseJwk.x,
    y: baseJwk.y,
  };
  const kid = await calculateJwkThumbprint(unsignedPublicJwk, "sha256");

  return {
    ...baseJwk,
    alg: "ES256",
    use: "sig",
    kid,
  };
}

function toPublicJwk(privateJwk: ToolPrivateJwk): ToolPublicJwk {
  return {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y,
    alg: privateJwk.alg,
    use: privateJwk.use,
    kid: privateJwk.kid,
  };
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  expectedValue?: string,
): string {
  const field = value[key];

  if (typeof field !== "string" || field.length === 0) {
    throw new Error(
      `${TOOL_PRIVATE_JWK_ENV} is missing a valid "${key}" string.`,
    );
  }

  if (expectedValue && field !== expectedValue) {
    throw new Error(
      `${TOOL_PRIVATE_JWK_ENV} must use ${key}=${expectedValue}.`,
    );
  }

  return field;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
