import { requireAppOrigin } from "./config.ts";
import { assertHostedDynamicRegistrationMetadata } from "./dynamic_registration_support.ts";
import type { DeploymentBinding } from "./types.ts";

const LTI_TOOL_CONFIGURATION_CLAIM =
  "https://purl.imsglobal.org/spec/lti-tool-configuration";
const MOODLE_SCOPE_LIST = [
  "https://purl.imsglobal.org/spec/lti-ags/scope/score",
  "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
  "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
  "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
  "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
] as const;

interface MoodleOpenIdProviderConfiguration {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  registrationEndpoint: string;
}

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export function buildMoodleDynamicRegistrationUrl(
  appId: string,
  state: string | null = null,
  appOrigin = requireAppOrigin(),
): string {
  const url = new URL(
    `${appOrigin}/admin/packages/${
      encodeURIComponent(appId)
    }/deployment/register/moodle`,
  );

  if (state !== null) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function completeMoodleDynamicRegistration(input: {
  appTitle: string;
  openidConfigurationUrl: string;
  registrationToken: string | null;
  appOrigin?: string;
  fetch?: FetchLike;
}): Promise<{
  binding: Extract<DeploymentBinding, { lms: "moodle" }>;
  interoperability: {
    usedDeploymentIdFallback: boolean;
    deploymentIdSource:
      | "tool_configuration"
      | "response"
      | "openid_query"
      | null;
  };
}> {
  const appOrigin = input.appOrigin ?? requireAppOrigin();
  const fetcher = input.fetch ?? fetch;
  const providerConfiguration = await loadMoodleOpenIdProviderConfiguration(
    input.openidConfigurationUrl,
    fetcher,
  );
  const registrationResponse = await submitMoodleRegistration({
    appOrigin,
    appTitle: input.appTitle,
    registrationEndpoint: providerConfiguration.registrationEndpoint,
    registrationToken: input.registrationToken,
    fetch: fetcher,
  });

  const deploymentId = requireDeploymentId(
    registrationResponse,
    input.openidConfigurationUrl,
  );

  return {
    binding: {
      lms: "moodle",
      issuer: providerConfiguration.issuer,
      clientId: requireString(registrationResponse, "client_id"),
      deploymentId: deploymentId.value,
      authorizationEndpoint: providerConfiguration.authorizationEndpoint,
      accessTokenUrl: providerConfiguration.tokenEndpoint,
      jwksUrl: providerConfiguration.jwksUrl,
    },
    interoperability: {
      usedDeploymentIdFallback: deploymentId.source !== "tool_configuration",
      deploymentIdSource: deploymentId.source,
    },
  };
}

async function loadMoodleOpenIdProviderConfiguration(
  openidConfigurationUrl: string,
  fetcher: FetchLike,
): Promise<MoodleOpenIdProviderConfiguration> {
  const response = await fetcher(openidConfigurationUrl);

  if (!response.ok) {
    throw new Error(
      `Moodle openid_configuration fetch failed with status ${response.status}.`,
    );
  }

  const json = await response.json();
  const record = requireObject(
    json,
    "Moodle openid_configuration must be a JSON object.",
  );

  const providerConfiguration = {
    issuer: requireString(record, "issuer"),
    authorizationEndpoint: requireString(record, "authorization_endpoint"),
    tokenEndpoint: requireString(record, "token_endpoint"),
    jwksUrl: requireString(record, "jwks_uri"),
    registrationEndpoint: requireString(record, "registration_endpoint"),
  };

  assertHostedDynamicRegistrationMetadata({
    platformLabel: "Moodle",
    openidConfigurationUrl,
    ...providerConfiguration,
  });

  return providerConfiguration;
}

async function submitMoodleRegistration(input: {
  appOrigin: string;
  appTitle: string;
  registrationEndpoint: string;
  registrationToken: string | null;
  fetch: FetchLike;
}): Promise<Record<string, unknown>> {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (input.registrationToken !== null) {
    headers.set("authorization", `Bearer ${input.registrationToken}`);
  }

  const response = await input.fetch(input.registrationEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(
      buildMoodleRegistrationRequest(input.appOrigin, input.appTitle),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `Moodle registration failed with status ${response.status}.`,
    );
  }

  return requireObject(
    await response.json(),
    "Moodle registration response must be a JSON object.",
  );
}

function buildMoodleRegistrationRequest(appOrigin: string, appTitle: string) {
  const origin = new URL(appOrigin);
  const launchUrl = `${appOrigin}/lti/launch`;

  return {
    application_type: "web",
    response_types: ["id_token"],
    grant_types: ["implicit", "client_credentials"],
    initiate_login_uri: `${appOrigin}/lti/login`,
    redirect_uris: [launchUrl],
    client_name: `${appTitle} via Lantern`,
    jwks_uri: `${appOrigin}/lti/jwks.json`,
    scope: MOODLE_SCOPE_LIST.join(" "),
    token_endpoint_auth_method: "private_key_jwt",
    [LTI_TOOL_CONFIGURATION_CLAIM]: {
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
      messages: [],
    },
  };
}

function requireDeploymentId(
  record: Record<string, unknown>,
  openidConfigurationUrl: string,
): {
  value: string;
  source: "tool_configuration" | "response" | "openid_query" | null;
} {
  const toolConfiguration = requireObject(
    record[LTI_TOOL_CONFIGURATION_CLAIM],
    "Moodle registration response did not include tool configuration.",
  );
  const openidConfiguration = new URL(openidConfigurationUrl);
  const candidates = [
    {
      source: "tool_configuration" as const,
      value: readOptionalString(toolConfiguration, "deployment_id"),
    },
    {
      source: "response" as const,
      value: readOptionalString(record, "deployment_id"),
    },
    {
      source: "openid_query" as const,
      value: openidConfiguration.searchParams.get("deployment_id") ??
        openidConfiguration.searchParams.get("deploymentId"),
    },
  ];

  for (const candidate of candidates) {
    if (candidate.value !== null) {
      return {
        value: candidate.value,
        source: candidate.source,
      };
    }
  }

  throw new Error(
    "Moodle registration response did not include a deployment_id.",
  );
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
    throw new Error(`Moodle registration data is missing "${key}".`);
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
