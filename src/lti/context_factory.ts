import type { LTIStorage } from '@longsightgroup/lti-tool';
import type { EnvReader } from '../platform/env.ts';
import { createLanternLtiToolContext, type LanternLtiToolContext } from './tool_provider.ts';

export function createCachedLtiToolContextFactory(input: {
  env: EnvReader;
  storage: LTIStorage;
}): (appOrigin?: string) => Promise<LanternLtiToolContext> {
  const contexts = new Map<string, Promise<LanternLtiToolContext>>();

  return (appOrigin) => {
    const cacheKey = appOrigin ?? '';
    let context = contexts.get(cacheKey);

    if (context === undefined) {
      context = createLanternLtiToolContext({
        env: input.env,
        storage: input.storage,
        ...(appOrigin === undefined ? {} : { appOrigin }),
      });
      contexts.set(cacheKey, context);
    }

    return context;
  };
}
