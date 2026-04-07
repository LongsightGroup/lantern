import { getTestToolPrivateJwkEnvValue } from '../test_helpers/lti.ts';
import { getDefaultRuntimeArtifactStore } from './artifact_store_fs.ts';

export const EXAMPLE_SNAPSHOT_ROOT = 'examples/apps/chapter-4-asteroids';
export const QUICK_STUDY_SNAPSHOT_ROOT = 'examples/apps/quick-study';
export const FILE_SYSTEM_RUNTIME_ARTIFACT_STORE = getDefaultRuntimeArtifactStore();
export const TEST_RUNTIME_ENV = {
  get(name: string): string | undefined {
    return name === 'LTI_TOOL_PRIVATE_JWK' ? getTestToolPrivateJwkEnvValue() : undefined;
  },
};

export function getReferenceAppSnapshotRoot(appId: 'chapter-4-asteroids' | 'quick-study'): string {
  return appId === 'quick-study' ? QUICK_STUDY_SNAPSHOT_ROOT : EXAMPLE_SNAPSHOT_ROOT;
}

export function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
    return;
  }

  Deno.env.set(name, value);
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
