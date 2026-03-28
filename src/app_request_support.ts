import type { Context } from '@hono/hono';
import type { LoginRequest } from './lti/login.ts';
export { parseBrokerVerificationRunForm } from './app_request_broker_verification.ts';

export function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

export function requireTrimmedFormValue(value: FormDataEntryValue | null, message: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(message);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}

export function requireTrimmedString(value: string | null, message: string): string {
  if (value === null) {
    throw new Error(message);
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error(message);
  }

  return trimmed;
}

export function normalizeNullableString(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

export function formValueAsString(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}

export function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

export async function readLoginRequest(context: Context): Promise<LoginRequest> {
  if (context.req.method === 'GET') {
    const url = new URL(context.req.url);

    return {
      iss: requireTrimmedString(url.searchParams.get('iss'), 'LTI issuer is required.'),
      loginHint: requireTrimmedString(
        url.searchParams.get('login_hint'),
        'LTI login_hint is required.',
      ),
      targetLinkUri: requireTrimmedString(
        url.searchParams.get('target_link_uri'),
        'LTI target_link_uri is required.',
      ),
      clientId: requireTrimmedString(
        url.searchParams.get('client_id'),
        'LTI client_id is required.',
      ),
      deploymentId: resolveLoginDeploymentId({
        primary: url.searchParams.get('deployment_id'),
        secondary: url.searchParams.get('lti_deployment_id'),
      }),
      ltiMessageHint: normalizeNullableString(url.searchParams.get('lti_message_hint')),
    };
  }

  const formData = await context.req.formData();

  return {
    iss: requireTrimmedFormValue(formData.get('iss'), 'LTI issuer is required.'),
    loginHint: requireTrimmedFormValue(formData.get('login_hint'), 'LTI login_hint is required.'),
    targetLinkUri: requireTrimmedFormValue(
      formData.get('target_link_uri'),
      'LTI target_link_uri is required.',
    ),
    clientId: requireTrimmedFormValue(formData.get('client_id'), 'LTI client_id is required.'),
    deploymentId: resolveLoginDeploymentId({
      primary: formValueAsString(formData.get('deployment_id')),
      secondary: formValueAsString(formData.get('lti_deployment_id')),
    }),
    ltiMessageHint: normalizeOptionalString(formData.get('lti_message_hint')),
  };
}

export function readRuntimeFileRequest(context: Context): {
  token: string;
  relativePath: string;
} {
  const pathname = new URL(context.req.url).pathname;
  const prefix = `/runtime/sessions/${context.req.param('sessionId')}/files/`;

  if (!pathname.startsWith(prefix)) {
    throw new Error('Runtime file path is invalid.');
  }

  const rawPath = pathname.slice(prefix.length);
  const tokenPrefix = '__token__/';

  if (rawPath.startsWith(tokenPrefix)) {
    const pathWithoutPrefix = rawPath.slice(tokenPrefix.length);
    const slashIndex = pathWithoutPrefix.indexOf('/');

    if (slashIndex < 0) {
      throw new Error('Runtime file path is invalid.');
    }

    const token = decodeURIComponent(pathWithoutPrefix.slice(0, slashIndex));
    const relativePath = decodeURIComponent(pathWithoutPrefix.slice(slashIndex + 1));

    return {
      token: requireTrimmedString(token, 'Runtime session token is required.'),
      relativePath,
    };
  }

  return {
    token: requireTrimmedString(
      new URL(context.req.url).searchParams.get('token'),
      'Runtime session token is required.',
    ),
    relativePath: decodeURIComponent(rawPath),
  };
}

function resolveLoginDeploymentId(input: {
  primary: string | null;
  secondary: string | null;
}): string {
  const primary = normalizeNullableString(input.primary);
  const secondary = normalizeNullableString(input.secondary);

  if (primary !== null && secondary !== null && primary !== secondary) {
    throw new Error('LTI deployment_id and lti_deployment_id did not match.');
  }

  return requireTrimmedString(primary ?? secondary, 'LTI deployment_id is required.');
}
