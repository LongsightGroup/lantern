export interface PublicOriginRequestInput {
  requestUrl: string;
  forwardedHeader: string | null;
  xForwardedHost: string | null;
  xForwardedProto: string | null;
}

const INVALID_PUBLIC_ORIGIN_MESSAGE =
  'Lantern public origin must be an absolute http or https URL.';

export function normalizePublicOrigin(value: string): string {
  return normalizeHttpOrigin(value, INVALID_PUBLIC_ORIGIN_MESSAGE);
}

export function normalizeHttpOrigin(value: string, invalidMessage: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(invalidMessage);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(invalidMessage);
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error(invalidMessage);
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

export function resolvePublicOriginFromRequest(input: PublicOriginRequestInput): string {
  const requestUrl = new URL(input.requestUrl);
  const forwarded = parseForwardedHeader(input.forwardedHeader);
  const proto =
    forwarded.proto ??
    readForwardedValue(input.xForwardedProto) ??
    requestUrl.protocol.slice(0, -1);
  const host = forwarded.host ?? readForwardedValue(input.xForwardedHost) ?? requestUrl.host;

  return normalizePublicOrigin(`${proto}://${host}`);
}

export function resolveConfiguredPublicOrigin(
  input: PublicOriginRequestInput & {
    configuredOrigin: string | null | undefined;
  },
): string {
  if (
    input.forwardedHeader !== null ||
    input.xForwardedHost !== null ||
    input.xForwardedProto !== null
  ) {
    return resolvePublicOriginFromRequest(input);
  }

  if (input.configuredOrigin !== null && input.configuredOrigin !== undefined) {
    return normalizePublicOrigin(input.configuredOrigin);
  }

  return normalizePublicOrigin(new URL(input.requestUrl).origin);
}

function parseForwardedHeader(value: string | null): {
  host: string | null;
  proto: string | null;
} {
  if (value === null || value.trim() === '') {
    return {
      host: null,
      proto: null,
    };
  }

  let host: string | null = null;
  let proto: string | null = null;
  const firstEntry = value.split(',')[0]?.trim() ?? '';

  for (const part of firstEntry.split(';')) {
    const [rawKey, rawValue] = part.split('=', 2);

    if (rawKey === undefined || rawValue === undefined) {
      continue;
    }

    const key = rawKey.trim().toLowerCase();
    const decodedValue = unquote(rawValue.trim());

    if (decodedValue === '') {
      continue;
    }

    if (key === 'host') {
      host = decodedValue;
    }

    if (key === 'proto') {
      proto = decodedValue.toLowerCase();
    }
  }

  return {
    host,
    proto,
  };
}

function readForwardedValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const first = value.split(',')[0]?.trim() ?? '';
  return first === '' ? null : unquote(first);
}

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}
