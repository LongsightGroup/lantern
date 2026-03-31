import { requireAppOrigin } from "./config.ts";
import { assertHostedDynamicRegistrationMetadata } from "./dynamic_registration_support.ts";
import {
  type DeploymentBinding,
  LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
} from "./types.ts";

const SAKAI_TOOL_CONFIGURATION_CLAIM =
  "https://purl.imsglobal.org/spec/lti-tool-configuration";

interface SakaiOpenIdProviderConfiguration {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  registrationEndpoint: string;
}

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function buildSakaiDynamicRegistrationUrl(
  appId: string,
  state: string | null = null,
  appOrigin = requireAppOrigin(),
): string {
  const url = new URL(
    `${appOrigin}/admin/packages/${
      encodeURIComponent(appId)
    }/deployment/register/sakai`,
  );

  if (state !== null) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function completeSakaiDynamicRegistration(input: {
  appId: string;
  appTitle: string;
  openidConfigurationUrl: string;
  registrationToken: string;
  appOrigin?: string;
  fetch?: FetchLike;
}): Promise<Extract<DeploymentBinding, { lms: "sakai" }>> {
  const appOrigin = input.appOrigin ?? requireAppOrigin();
  const fetcher = input.fetch ?? fetch;
  const providerConfiguration = await loadSakaiOpenIdProviderConfiguration(
    input.openidConfigurationUrl,
    fetcher,
  );
  const registrationResponse = await submitSakaiRegistration({
    appOrigin,
    appTitle: input.appTitle,
    registrationEndpoint: providerConfiguration.registrationEndpoint,
    registrationToken: input.registrationToken,
    fetch: fetcher,
  });

  return extractSakaiDeploymentBinding(
    providerConfiguration,
    registrationResponse,
    input.openidConfigurationUrl,
  );
}

async function loadSakaiOpenIdProviderConfiguration(
  openidConfigurationUrl: string,
  fetcher: FetchLike,
): Promise<SakaiOpenIdProviderConfiguration> {
  const response = await fetcher(openidConfigurationUrl);

  if (!response.ok) {
    throw new Error(
      `Sakai openid_configuration fetch failed with status ${response.status}.`,
    );
  }

  const json = await response.json();
  const record = requireObject(
    json,
    "Sakai openid_configuration must be a JSON object.",
  );

  const providerConfiguration = {
    issuer: requireString(record, "issuer"),
    authorizationEndpoint: requireString(record, "authorization_endpoint"),
    tokenEndpoint: requireString(record, "token_endpoint"),
    jwksUrl: requireString(record, "jwks_uri"),
    registrationEndpoint: requireString(record, "registration_endpoint"),
  };

  assertHostedDynamicRegistrationMetadata({
    platformLabel: "Sakai",
    openidConfigurationUrl,
    ...providerConfiguration,
  });

  return providerConfiguration;
}

async function submitSakaiRegistration(input: {
  appOrigin: string;
  appTitle: string;
  registrationEndpoint: string;
  registrationToken: string;
  fetch: FetchLike;
}): Promise<Record<string, unknown>> {
  const response = await input.fetch(input.registrationEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.registrationToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(
      buildSakaiRegistrationRequest(input.appOrigin, input.appTitle),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `Sakai registration failed with status ${response.status}.`,
    );
  }

  return requireObject(
    await response.json(),
    "Sakai registration response must be a JSON object.",
  );
}

function buildSakaiRegistrationRequest(appOrigin: string, appTitle: string) {
  const origin = new URL(appOrigin);
  const launchUrl = `${appOrigin}/lti/launch`;
  const deepLinkingUrl = `${appOrigin}/lti/deep-linking`;

  return {
    application_type: "web",
    response_types: ["id_token"],
    grant_types: ["implicit", "client_credentials"],
    initiate_login_uri: `${appOrigin}/lti/login`,
    redirect_uris: [launchUrl, deepLinkingUrl],
    client_name: `${appTitle} via Lantern`,
    jwks_uri: `${appOrigin}/lti/jwks.json`,
    token_endpoint_auth_method: "private_key_jwt",
    [SAKAI_TOOL_CONFIGURATION_CLAIM]: {
      domain: origin.host,
      description:
        `Launch the approved ${appTitle} activity through Lantern's governed runtime.`,
      target_link_uri: launchUrl,
      claims: [
        "iss",
        "sub",
        "name",
        "given_name",
        "family_name",
        "email",
        "preferred_username",
      ],
      messages: [
        {
          type: "LtiResourceLinkRequest",
          target_link_uri: launchUrl,
          label: `${appTitle} in Lantern`,
        },
        {
          type: LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE,
          target_link_uri: deepLinkingUrl,
          label: "Select Lantern activity",
        },
      ],
    },
  };
}

function extractSakaiDeploymentBinding(
  providerConfiguration: SakaiOpenIdProviderConfiguration,
  registrationResponse: Record<string, unknown>,
  openidConfigurationUrl: string,
): Extract<DeploymentBinding, { lms: "sakai" }> {
  const toolConfiguration = requireObject(
    registrationResponse[SAKAI_TOOL_CONFIGURATION_CLAIM],
    "Sakai registration response did not include tool configuration.",
  );
  const deploymentId = readOptionalString(toolConfiguration, "deployment_id") ??
    new URL(openidConfigurationUrl).searchParams.get("deploymentId");

  if (!deploymentId) {
    throw new Error(
      "Sakai registration response did not include a deployment_id.",
    );
  }

  return {
    lms: "sakai",
    issuer: providerConfiguration.issuer,
    clientId: requireString(registrationResponse, "client_id"),
    deploymentId,
    authorizationEndpoint: providerConfiguration.authorizationEndpoint,
    accessTokenUrl: providerConfiguration.tokenEndpoint,
    jwksUrl: providerConfiguration.jwksUrl,
  };
}

function requireObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = readOptionalString(record, key);

  if (!value) {
    throw new Error(`Sakai registration data is missing "${key}".`);
  }

  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
