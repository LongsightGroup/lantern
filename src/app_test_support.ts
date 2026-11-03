import { getTestToolPrivateJwkEnvValue, TEST_LTI_STATE_SECRET } from './test_helpers/lti.ts';

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
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

export async function withCanvasReturnEnv(run: () => Promise<void>): Promise<void> {
  const previousAppOrigin = process.env['APP_ORIGIN'];
  const previousToolKey = process.env['LTI_TOOL_PRIVATE_JWK'];
  const previousStateSecret = process.env['LTI_STATE_SECRET'];

  process.env['APP_ORIGIN'] = 'https://lantern.example';
  process.env['LTI_TOOL_PRIVATE_JWK'] = getTestToolPrivateJwkEnvValue();
  process.env['LTI_STATE_SECRET'] = TEST_LTI_STATE_SECRET;

  try {
    await run();
  } finally {
    restoreEnv('APP_ORIGIN', previousAppOrigin);
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
    restoreEnv('LTI_STATE_SECRET', previousStateSecret);
  }
}

export async function withRuntimeOriginEnv<T>(
  run: () => Promise<T>,
  options: {
    appOrigin?: string;
    runtimeOrigin?: string;
  } = {},
): Promise<T> {
  const previousAppOrigin = process.env['APP_ORIGIN'];
  const previousRuntimeOrigin = process.env['APP_RUNTIME_ORIGIN'];
  const previousToolKey = process.env['LTI_TOOL_PRIVATE_JWK'];
  const previousStateSecret = process.env['LTI_STATE_SECRET'];

  process.env['APP_ORIGIN'] = options.appOrigin ?? 'https://lantern.example';
  process.env['APP_RUNTIME_ORIGIN'] = options.runtimeOrigin ?? 'https://runtime.lantern.example';
  process.env['LTI_TOOL_PRIVATE_JWK'] = getTestToolPrivateJwkEnvValue();
  process.env['LTI_STATE_SECRET'] = TEST_LTI_STATE_SECRET;

  try {
    return await run();
  } finally {
    restoreEnv('APP_ORIGIN', previousAppOrigin);
    restoreEnv('APP_RUNTIME_ORIGIN', previousRuntimeOrigin);
    restoreEnv('LTI_TOOL_PRIVATE_JWK', previousToolKey);
    restoreEnv('LTI_STATE_SECRET', previousStateSecret);
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
