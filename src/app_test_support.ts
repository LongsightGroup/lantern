import { createLocalJWKSet, jwtVerify } from 'jose';
import { getPublicJwkSet } from './lti/tool_key.ts';
import { buildDeploymentBinding, getTestToolPrivateJwkEnvValue } from './test_helpers/lti.ts';

export const REFERENCE_APP_SNAPSHOT_ROOTS = {
  'chapter-4-asteroids': 'examples/apps/chapter-4-asteroids',
  'quick-study': 'examples/apps/quick-study',
} as const;

export type ReferenceAppId = keyof typeof REFERENCE_APP_SNAPSHOT_ROOTS;

export const EXAMPLE_SNAPSHOT_ROOT = REFERENCE_APP_SNAPSHOT_ROOTS['chapter-4-asteroids'];
export const QUICK_STUDY_SNAPSHOT_ROOT = REFERENCE_APP_SNAPSHOT_ROOTS['quick-study'];

export function getReferenceAppSnapshotRoot(appId: ReferenceAppId): string {
  return REFERENCE_APP_SNAPSHOT_ROOTS[appId];
}

export function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
}

export async function withCanvasReturnEnv(run: () => Promise<void>): Promise<void> {
  const previousAppOrigin = Deno.env.get('APP_ORIGIN');
  const previousToolKey = Deno.env.get('LTI_TOOL_PRIVATE_JWK');

  Deno.env.set('APP_ORIGIN', 'https://lantern.example');
  Deno.env.set('LTI_TOOL_PRIVATE_JWK', getTestToolPrivateJwkEnvValue());

  try {
    await run();
  } finally {
    restoreEnv('APP_ORIGIN', previousAppOrigin);
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
  }
}

export async function withRuntimeOriginEnv<T>(
  run: () => Promise<T>,
  options: {
    appOrigin?: string;
    runtimeOrigin?: string;
  } = {},
): Promise<T> {
  const previousAppOrigin = Deno.env.get('APP_ORIGIN');
  const previousRuntimeOrigin = Deno.env.get('APP_RUNTIME_ORIGIN');

  Deno.env.set('APP_ORIGIN', options.appOrigin ?? 'https://lantern.example');
  Deno.env.set('APP_RUNTIME_ORIGIN', options.runtimeOrigin ?? 'https://runtime.lantern.example');

  try {
    return await run();
  } finally {
    restoreEnv('APP_ORIGIN', previousAppOrigin);
    restoreEnv('APP_RUNTIME_ORIGIN', previousRuntimeOrigin);
  }
}

export function extractHiddenInputValue(html: string, name: string): string {
  const pattern = new RegExp(`name="${name}" value="([^"]+)"`);
  const match = html.match(pattern);

  if (!match?.[1]) {
    throw new Error(`Hidden input ${name} was not found.`);
  }

  return match[1];
}

export async function verifyDeepLinkingResponseJwt(jwt: string) {
  const keySet = createLocalJWKSet(
    await getPublicJwkSet({
      get(name: string) {
        return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
      },
    }),
  );
  const binding = buildDeploymentBinding();

  return await jwtVerify(jwt, keySet, {
    issuer: binding.clientId,
    audience: binding.issuer,
    currentDate: new Date('2026-03-24T18:31:00Z'),
  });
}

export async function withFetchStub<T>(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(input, init));

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
