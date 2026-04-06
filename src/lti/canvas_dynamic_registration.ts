import {
  buildCanvasDeepLinkingUrl,
  buildCanvasJwksUrl,
  buildCanvasLaunchUrl,
  requireAppOrigin,
} from './config.ts';
import { assertCanvasDynamicRegistrationMetadata } from './dynamic_registration_support.ts';
import { resolveCanvasPlatform } from './canvas_platform.ts';
import {
  CANVAS_LTI_SCOPES,
  LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
  LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE,
} from './types.ts';

const LTI_TOOL_CONFIGURATION_CLAIM = 'https://purl.imsglobal.org/spec/lti-tool-configuration';
const CANVAS_PRIVACY_LEVEL_EXTENSION = 'https://canvas.instructure.com/lti/privacy_level';
const CANVAS_TOOL_ID_EXTENSION = 'https://canvas.instructure.com/lti/tool_id';

interface CanvasOpenIdProviderConfiguration {
  issuer: string;
  authorizationEndpoint: string;
  registrationEndpoint: string;
}

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function buildCanvasDynamicRegistrationUrl(
  appId: string,
  state: string | null = null,
  appOrigin = requireAppOrigin(),
): string {
  const url = new URL(
    `${appOrigin}/admin/packages/${encodeURIComponent(appId)}/deployment/register/canvas`,
  );

  if (state !== null) {
    url.searchParams.set('state', state);
  }

  return url.toString();
}

export async function completeCanvasDynamicRegistration(input: {
  appTitle: string;
  openidConfigurationUrl: string;
  registrationToken: string;
  appOrigin?: string;
  fetch?: FetchLike;
}): Promise<{
  canvasEnvironment: 'production' | 'beta' | 'test';
  issuer: string;
  clientId: string;
}> {
  const appOrigin = input.appOrigin ?? requireAppOrigin();
  const fetcher = input.fetch ?? fetch;
  const providerConfiguration = await loadCanvasOpenIdProviderConfiguration({
    openidConfigurationUrl: input.openidConfigurationUrl,
    registrationToken: input.registrationToken,
    fetch: fetcher,
  });
  const registrationResponse = await submitCanvasRegistration({
    appOrigin,
    appTitle: input.appTitle,
    registrationEndpoint: providerConfiguration.registrationEndpoint,
    registrationToken: input.registrationToken,
    fetch: fetcher,
  });
  const platform = resolveCanvasPlatform(providerConfiguration.issuer);

  return {
    canvasEnvironment: platform.environment,
    issuer: providerConfiguration.issuer,
    clientId: requireString(registrationResponse, 'client_id'),
  };
}

async function loadCanvasOpenIdProviderConfiguration(input: {
  openidConfigurationUrl: string;
  registrationToken: string;
  fetch: FetchLike;
}): Promise<CanvasOpenIdProviderConfiguration> {
  const response = await input.fetch(input.openidConfigurationUrl, {
    headers: {
      authorization: `Bearer ${input.registrationToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Canvas openid_configuration fetch failed with status ${response.status}.`);
  }

  const record = requireObject(
    await response.json(),
    'Canvas openid_configuration must be a JSON object.',
  );
  const providerConfiguration = {
    issuer: requireString(record, 'issuer'),
    authorizationEndpoint: requireString(record, 'authorization_endpoint'),
    registrationEndpoint: requireString(record, 'registration_endpoint'),
  };

  assertCanvasDynamicRegistrationMetadata({
    openidConfigurationUrl: input.openidConfigurationUrl,
    ...providerConfiguration,
  });

  return providerConfiguration;
}

async function submitCanvasRegistration(input: {
  appOrigin: string;
  appTitle: string;
  registrationEndpoint: string;
  registrationToken: string;
  fetch: FetchLike;
}): Promise<Record<string, unknown>> {
  const response = await input.fetch(input.registrationEndpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.registrationToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildCanvasRegistrationRequest(input.appOrigin, input.appTitle)),
  });

  if (!response.ok) {
    throw new Error(`Canvas registration failed with status ${response.status}.`);
  }

  return requireObject(
    await response.json(),
    'Canvas registration response must be a JSON object.',
  );
}

function buildCanvasRegistrationRequest(appOrigin: string, appTitle: string) {
  const origin = new URL(appOrigin);
  const launchUrl = buildCanvasLaunchUrl(appOrigin);
  const deepLinkingUrl = buildCanvasDeepLinkingUrl(appOrigin);
  const resourceSelectionUrl = `${deepLinkingUrl}?placement=resource_selection`;

  return {
    application_type: 'web',
    response_types: ['id_token'],
    grant_types: ['implicit', 'client_credentials'],
    initiate_login_uri: `${appOrigin}/lti/login`,
    redirect_uris: [launchUrl, deepLinkingUrl, resourceSelectionUrl],
    client_name: `${appTitle} via Lantern`,
    jwks_uri: buildCanvasJwksUrl(appOrigin),
    scope: CANVAS_LTI_SCOPES.join(' '),
    token_endpoint_auth_method: 'private_key_jwt',
    [LTI_TOOL_CONFIGURATION_CLAIM]: {
      domain: origin.host,
      description: `Launch the approved ${appTitle} activity through Lantern's governed runtime.`,
      target_link_uri: launchUrl,
      claims: ['iss', 'sub', 'name', 'given_name', 'family_name', 'email', 'preferred_username'],
      messages: [
        {
          type: LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE,
          target_link_uri: launchUrl,
          label: 'Lantern Demo',
          placements: ['course_navigation'],
        },
        {
          type: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
          target_link_uri: deepLinkingUrl,
          label: 'Select Lantern activity',
          placements: ['assignment_selection'],
        },
        {
          type: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
          target_link_uri: resourceSelectionUrl,
          label: 'Select Lantern activity',
          placements: ['resource_selection'],
        },
      ],
      [CANVAS_PRIVACY_LEVEL_EXTENSION]: 'public',
      [CANVAS_TOOL_ID_EXTENSION]: 'lantern-demo-broker',
    },
  };
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Canvas registration data is missing "${key}".`);
  }

  return value;
}
