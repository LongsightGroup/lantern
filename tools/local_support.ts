import { calculateJwkThumbprint, exportJWK, generateKeyPair } from 'jose';

export const DEFAULT_LOCAL_PORT = '8417';
export const DEFAULT_LOCAL_APP_ORIGIN = `http://localhost:${DEFAULT_LOCAL_PORT}`;
export const DEFAULT_LOCAL_ENV_PATH = '.env.local';

const ENV_ASSIGNMENT_PATTERN = /^\s*([A-Z][A-Z0-9_]*)\s*=/;

export function listDeclaredEnvKeys(text: string): Set<string> {
  const keys = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(ENV_ASSIGNMENT_PATTERN);

    if (match?.[1]) {
      keys.add(match[1]);
    }
  }

  return keys;
}

export function appendMissingEnvAssignments(input: {
  existingText: string | null;
  assignments: Record<string, string>;
}): {
  text: string;
  addedKeys: string[];
  created: boolean;
} {
  const created = input.existingText === null;
  const existingText = input.existingText ?? defaultLocalEnvHeader();
  const declaredKeys = listDeclaredEnvKeys(existingText);
  const addedKeys: string[] = [];
  const lines = [existingText.trimEnd()];

  for (const [key, value] of Object.entries(input.assignments)) {
    if (declaredKeys.has(key)) {
      continue;
    }

    lines.push(`${key}=${formatEnvValue(value)}`);
    addedKeys.push(key);
  }

  return {
    text: `${lines.filter((line) => line !== '').join('\n')}\n`,
    addedKeys,
    created,
  };
}

export async function createLocalToolPrivateJwkString(): Promise<string> {
  const keyPair = await generateKeyPair('RS256', { extractable: true });
  const exported = await exportJWK(keyPair.privateKey);
  const privateJwk = normalizePrivateJwk(exported);
  const kid = await calculateJwkThumbprint(
    {
      kty: privateJwk.kty,
      n: privateJwk.n,
      e: privateJwk.e,
    },
    'sha256',
  );

  return JSON.stringify({
    ...privateJwk,
    alg: 'RS256',
    use: 'sig',
    kid,
  });
}

export function defaultLocalEnvAssignments(): Record<string, string> {
  return {
    PORT: DEFAULT_LOCAL_PORT,
    APP_ORIGIN: DEFAULT_LOCAL_APP_ORIGIN,
    APP_RUNTIME_ORIGIN: DEFAULT_LOCAL_APP_ORIGIN,
  };
}

function defaultLocalEnvHeader(): string {
  return [
    '# Local Lantern development defaults.',
    '# Full Lantern persistence runs through Cloudflare D1 via Wrangler.',
    '# APP_RUNTIME_ORIGIN defaults to the same localhost origin for local development.',
    '',
  ].join('\n');
}

function formatEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@?&=%+-]+$/.test(value) ? value : JSON.stringify(value);
}

function normalizePrivateJwk(value: JsonWebKey): {
  kty: 'RSA';
  n: string;
  e: string;
  d: string;
  p: string;
  q: string;
  dp: string;
  dq: string;
  qi: string;
} {
  if (
    value.kty !== 'RSA' ||
    typeof value.n !== 'string' ||
    typeof value.e !== 'string' ||
    typeof value.d !== 'string' ||
    typeof value.p !== 'string' ||
    typeof value.q !== 'string' ||
    typeof value.dp !== 'string' ||
    typeof value.dq !== 'string' ||
    typeof value.qi !== 'string'
  ) {
    throw new Error('Generated local signing key was not a complete RSA private JWK.');
  }

  return {
    kty: 'RSA',
    n: value.n,
    e: value.e,
    d: value.d,
    p: value.p,
    q: value.q,
    dp: value.dp,
    dq: value.dq,
    qi: value.qi,
  };
}
