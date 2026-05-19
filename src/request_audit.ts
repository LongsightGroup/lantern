import type { Context } from '@hono/hono';

const MAX_HEADER_VALUE_LENGTH = 160;
const MAX_KEY_COUNT = 12;
const MAX_KEY_LENGTH = 48;

export interface RequestAuditEnvelope {
  method: string;
  path: string;
  host: string | null;
  queryKeys: string[];
  formKeys: string[];
  bodyKeys: string[];
  contentType: string | null;
  contentLength: number | null;
  userAgent: string | null;
  clientIpMasked: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  cfRay: string | null;
}

export function buildRequestAuditEnvelope(input: {
  context: Context;
  formData?: FormData;
  body?: unknown;
}): RequestAuditEnvelope {
  const url = new URL(input.context.req.url);

  return {
    method: input.context.req.method.toUpperCase(),
    path: url.pathname,
    host: readBoundedHeader(input.context, 'host'),
    queryKeys: collectSearchParamKeys(url.searchParams),
    formKeys: collectFormKeys(input.formData),
    bodyKeys: collectBodyKeys(input.body),
    contentType: readBoundedHeader(input.context, 'content-type'),
    contentLength: readContentLength(input.context),
    userAgent: readBoundedHeader(input.context, 'user-agent'),
    clientIpMasked: readMaskedClientIp(input.context),
    forwardedHost: readBoundedHeader(input.context, 'x-forwarded-host'),
    forwardedProto: readBoundedHeader(input.context, 'x-forwarded-proto'),
    cfRay: readBoundedHeader(input.context, 'cf-ray'),
  };
}

function readBoundedHeader(context: Context, name: string): string | null {
  const value = context.req.header(name);

  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  return trimmed.slice(0, MAX_HEADER_VALUE_LENGTH);
}

function readContentLength(context: Context): number | null {
  const value = context.req.header('content-length');

  if (value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function collectSearchParamKeys(searchParams: URLSearchParams): string[] {
  return collectLimitedKeys(searchParams.keys());
}

function collectFormKeys(formData: FormData | undefined): string[] {
  if (formData === undefined) {
    return [];
  }

  return collectLimitedKeys(formData.keys());
}

function collectBodyKeys(body: unknown): string[] {
  if (!isRecord(body)) {
    return [];
  }

  return collectLimitedKeys(Object.keys(body));
}

function collectLimitedKeys(keys: Iterable<string>): string[] {
  const unique = new Set<string>();

  for (const key of keys) {
    const trimmed = key.trim();

    if (trimmed === '') {
      continue;
    }

    unique.add(trimmed.slice(0, MAX_KEY_LENGTH));

    if (unique.size >= MAX_KEY_COUNT) {
      break;
    }
  }

  return [...unique].sort();
}

function readMaskedClientIp(context: Context): string | null {
  const forwardedFor = context.req.header('x-forwarded-for');
  const firstForwardedIp = forwardedFor === undefined
    ? null
    : (forwardedFor.split(',')[0]?.trim() ?? null);
  const candidate = context.req.header('cf-connecting-ip') ?? context.req.header('x-real-ip') ??
    firstForwardedIp;

  if (candidate === null || candidate === undefined || candidate.trim() === '') {
    return null;
  }

  const trimmed = candidate.trim();
  const ipv4Match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);

  if (ipv4Match) {
    const [, first, second, third] = ipv4Match;

    return `${first}.${second}.${third}.x`;
  }

  if (trimmed.includes(':')) {
    const segments = trimmed.split(':').filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      return 'masked';
    }

    return `${segments.slice(0, 4).join(':')}:*`;
  }

  return 'masked';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
