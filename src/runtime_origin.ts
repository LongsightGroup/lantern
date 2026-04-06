import {
  normalizeHttpOrigin,
  type PublicOriginRequestInput,
  resolvePublicOriginFromRequest,
} from './public_origin.ts';

const INVALID_RUNTIME_ORIGIN_MESSAGE = 'APP_RUNTIME_ORIGIN must be an absolute http or https URL.';
const MISSING_RUNTIME_ORIGIN_MESSAGE =
  'APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions.';
const WRONG_RUNTIME_ORIGIN_MESSAGE = 'Runtime session requests must use APP_RUNTIME_ORIGIN.';

export function normalizeRuntimeOrigin(value: string): string {
  return normalizeHttpOrigin(value, INVALID_RUNTIME_ORIGIN_MESSAGE);
}

export function requireConfiguredRuntimeOrigin(
  configuredOrigin: string | null | undefined,
): string {
  const trimmedOrigin = configuredOrigin?.trim() ?? '';

  if (trimmedOrigin === '') {
    throw new Error(MISSING_RUNTIME_ORIGIN_MESSAGE);
  }

  return normalizeRuntimeOrigin(trimmedOrigin);
}

export function requireRuntimeRequestOrigin(
  input: PublicOriginRequestInput & {
    configuredOrigin: string | null | undefined;
  },
): string {
  const runtimeOrigin = requireConfiguredRuntimeOrigin(input.configuredOrigin);
  const requestOrigin = resolvePublicOriginFromRequest(input);

  if (requestOrigin !== runtimeOrigin) {
    throw new Error(WRONG_RUNTIME_ORIGIN_MESSAGE);
  }

  return runtimeOrigin;
}

export function buildRuntimeSessionBaseUrl(input: {
  runtimeOrigin: string;
  sessionId: string;
}): string {
  return `${input.runtimeOrigin}/runtime/sessions/${encodeURIComponent(input.sessionId)}`;
}

export function buildRuntimeSessionUrl(input: {
  runtimeOrigin: string;
  sessionId: string;
  token: string;
}): string {
  return `${buildRuntimeSessionBaseUrl(input)}?token=${encodeURIComponent(input.token)}`;
}
