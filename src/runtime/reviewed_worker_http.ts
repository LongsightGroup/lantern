import type { Context } from 'hono';

/** Builds the sanitized internal request passed to an immutable reviewed Worker. */
export function buildReviewedWorkerRequest(
  context: Context,
  session: {
    readonly sessionId: string;
    readonly sessionToken: string;
  },
  traceId?: string,
): Request {
  const sourceUrl = new URL(context.req.url);
  const pageUrl = new URL(
    `/governed/sessions/${encodeURIComponent(session.sessionId)}`,
    sourceUrl.origin,
  );
  pageUrl.searchParams.set('token', session.sessionToken);
  const targetUrl = new URL('https://reviewed-app.internal/');
  const cursor = sourceUrl.searchParams.get('cursor');
  if (cursor !== null) {
    targetUrl.searchParams.set('cursor', cursor);
  }
  const headers = new Headers({
    accept: 'text/html',
    'x-lantern-runtime-session-id': session.sessionId,
    'x-lantern-runtime-session-token': session.sessionToken,
    'x-lantern-runtime-page-url': `${pageUrl.pathname}${pageUrl.search}`,
  });
  if (traceId !== undefined) {
    headers.set('x-lantern-trace-id', traceId);
  }
  const language = context.req.header('accept-language');
  if (language !== undefined) {
    headers.set('accept-language', language.slice(0, 160));
  }
  return new Request(targetUrl, { method: 'GET', headers });
}

/** Enforces Lantern-owned headers on a reviewed Worker HTML response. */
export function sanitizeReviewedWorkerResponse(response: Response, lmsOrigin: string): Response {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('text/html')) {
    throw new Error('Reviewed Worker apps must return an HTML response.');
  }
  if (
    response.status < 200 ||
    response.status > 499 ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new Error('Reviewed Worker app returned an unsupported status.');
  }
  const headers = new Headers({
    'content-type': 'text/html; charset=UTF-8',
  });
  const contentLanguage = response.headers.get('content-language');
  if (contentLanguage !== null) {
    headers.set('content-language', contentLanguage.slice(0, 64));
  }
  applyRuntimeDocumentHeaders(headers, lmsOrigin);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function applyRuntimeDocumentHeaders(headers: Headers, lmsOrigin: string): void {
  headers.set('cache-control', 'private, no-store');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set(
    'content-security-policy',
    [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'self'",
      `frame-ancestors 'self' ${lmsOrigin}`,
    ].join('; '),
  );
  headers.set(
    'permissions-policy',
    ['camera=()', 'geolocation=()', 'microphone=()', 'payment=()', 'usb=()'].join(', '),
  );
}
