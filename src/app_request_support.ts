import type { Context } from '@hono/hono';
import type { CanvasLoginRequest } from './lti/login.ts';
import type { RecordBrokerVerificationRunInput } from './ops/repository.ts';

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

export function parseBrokerVerificationRunForm(
  formData: FormData,
): RecordBrokerVerificationRunInput {
  const source = parseBrokerVerificationSource(
    requireTrimmedFormValue(formData.get('source'), 'Broker verification source is required.'),
  );
  const status = parseBrokerVerificationStatus(
    requireTrimmedFormValue(formData.get('status'), 'Broker verification status is required.'),
  );
  const certificationState = parseBrokerCertificationState(
    normalizeOptionalString(formData.get('certificationState')),
  );

  if (source !== '1edtech' && certificationState !== null) {
    throw new Error('Internal verification runs cannot carry an official certification state.');
  }

  if (source !== '1edtech' && status === 'notCertified') {
    throw new Error('Only official 1EdTech verification runs can use the notCertified status.');
  }

  return {
    source,
    scope: 'canvasLti13LaunchAgsNrps',
    status,
    certificationState,
    summary: requireTrimmedFormValue(
      formData.get('summary'),
      'Broker verification summary is required.',
    ),
    detailUrl: parseOptionalAbsoluteUrl(
      normalizeOptionalString(formData.get('detailUrl')),
      'Verification detail URL must be an absolute URL.',
    ),
    checkedAt: parseVerificationCheckedAt(
      requireTrimmedFormValue(formData.get('checkedAt'), 'Checked-at timestamp is required.'),
    ),
  };
}

export async function readCanvasLoginRequest(context: Context): Promise<CanvasLoginRequest> {
  if (context.req.method === 'GET') {
    const url = new URL(context.req.url);

    return {
      iss: requireTrimmedString(url.searchParams.get('iss'), 'Canvas issuer is required.'),
      loginHint: requireTrimmedString(
        url.searchParams.get('login_hint'),
        'Canvas login_hint is required.',
      ),
      targetLinkUri: requireTrimmedString(
        url.searchParams.get('target_link_uri'),
        'Canvas target_link_uri is required.',
      ),
      clientId: requireTrimmedString(
        url.searchParams.get('client_id'),
        'Canvas client_id is required.',
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
    iss: requireTrimmedFormValue(formData.get('iss'), 'Canvas issuer is required.'),
    loginHint: requireTrimmedFormValue(
      formData.get('login_hint'),
      'Canvas login_hint is required.',
    ),
    targetLinkUri: requireTrimmedFormValue(
      formData.get('target_link_uri'),
      'Canvas target_link_uri is required.',
    ),
    clientId: requireTrimmedFormValue(formData.get('client_id'), 'Canvas client_id is required.'),
    deploymentId: resolveLoginDeploymentId({
      primary: formValueAsString(formData.get('deployment_id')),
      secondary: formValueAsString(formData.get('lti_deployment_id')),
    }),
    ltiMessageHint: normalizeOptionalString(formData.get('lti_message_hint')),
  };
}

export function runtimeFilePathFromRequest(context: Context): string {
  const pathname = new URL(context.req.url).pathname;
  const prefix = `/runtime/sessions/${context.req.param('sessionId')}/files/`;

  if (!pathname.startsWith(prefix)) {
    throw new Error('Runtime file path is invalid.');
  }

  return decodeURIComponent(pathname.slice(prefix.length));
}

function parseBrokerVerificationSource(value: string): RecordBrokerVerificationRunInput['source'] {
  switch (value) {
    case 'manual':
    case 'ci':
    case '1edtech':
      return value;
    default:
      throw new Error('Choose one supported broker verification source.');
  }
}

function parseBrokerVerificationStatus(value: string): RecordBrokerVerificationRunInput['status'] {
  switch (value) {
    case 'passed':
    case 'failed':
    case 'pending':
    case 'notCertified':
      return value;
    default:
      throw new Error('Choose one supported broker verification status.');
  }
}

function parseBrokerCertificationState(
  value: string | null,
): RecordBrokerVerificationRunInput['certificationState'] {
  switch (value) {
    case null:
      return null;
    case 'ltiAdvantageCertified':
    case 'ltiAdvantageComplete':
      return value;
    default:
      throw new Error('Choose one supported official certification state.');
  }
}

function parseOptionalAbsoluteUrl(value: string | null, message: string): string | null {
  if (value === null) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(message);
    }

    return url.toString();
  } catch {
    throw new Error(message);
  }
}

function parseVerificationCheckedAt(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.valueOf())) {
    throw new TypeError('Checked-at timestamp must be a valid ISO-8601 value.');
  }

  return timestamp.toISOString();
}

function resolveLoginDeploymentId(input: {
  primary: string | null;
  secondary: string | null;
}): string {
  const primary = normalizeNullableString(input.primary);
  const secondary = normalizeNullableString(input.secondary);

  if (primary !== null && secondary !== null && primary !== secondary) {
    throw new Error('Canvas deployment_id and lti_deployment_id did not match.');
  }

  return requireTrimmedString(primary ?? secondary, 'Canvas deployment_id is required.');
}
