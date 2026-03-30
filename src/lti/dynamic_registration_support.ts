import { resolveCanvasPlatform } from "./canvas_platform.ts";

export function assertCanvasDynamicRegistrationMetadata(input: {
  openidConfigurationUrl: string;
  issuer: string;
  authorizationEndpoint: string;
  registrationEndpoint: string;
}): void {
  const openidConfigurationUrl = requireHttpsUrl(
    input.openidConfigurationUrl,
    "Canvas openid_configuration URL",
  );
  const issuer = requireHttpsUrl(input.issuer, "Canvas issuer");
  const authorizationEndpoint = requireHttpsUrl(
    input.authorizationEndpoint,
    "Canvas authorization endpoint",
  );
  const registrationEndpoint = requireHttpsUrl(
    input.registrationEndpoint,
    "Canvas registration endpoint",
  );
  const platform = resolveCanvasPlatform(input.issuer);

  if (openidConfigurationUrl.host !== issuer.host) {
    throw new Error(
      "Canvas openid_configuration host did not match the Canvas issuer host.",
    );
  }

  if (registrationEndpoint.host !== issuer.host) {
    throw new Error(
      "Canvas registration endpoint host did not match the Canvas issuer host.",
    );
  }

  if (authorizationEndpoint.toString() !== platform.authorizationEndpoint) {
    throw new Error(
      "Canvas authorization endpoint did not match the supported Canvas platform metadata.",
    );
  }
}

export function assertHostedDynamicRegistrationMetadata(input: {
  platformLabel: "Moodle" | "Sakai";
  openidConfigurationUrl: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  registrationEndpoint: string;
}): void {
  const openidConfigurationUrl = requireHttpsUrl(
    input.openidConfigurationUrl,
    `${input.platformLabel} openid_configuration URL`,
  );
  const issuer = requireHttpsUrl(input.issuer, `${input.platformLabel} issuer`);
  const authorizationEndpoint = requireHttpsUrl(
    input.authorizationEndpoint,
    `${input.platformLabel} authorization endpoint`,
  );
  const tokenEndpoint = requireHttpsUrl(
    input.tokenEndpoint,
    `${input.platformLabel} token endpoint`,
  );
  const jwksUrl = requireHttpsUrl(
    input.jwksUrl,
    `${input.platformLabel} JWKS URL`,
  );
  const registrationEndpoint = requireHttpsUrl(
    input.registrationEndpoint,
    `${input.platformLabel} registration endpoint`,
  );
  const hosts = [
    openidConfigurationUrl.host,
    issuer.host,
    authorizationEndpoint.host,
    tokenEndpoint.host,
    jwksUrl.host,
    registrationEndpoint.host,
  ];

  if (new Set(hosts).size !== 1) {
    throw new Error(
      `${input.platformLabel} registration metadata must stay on one HTTPS host anchored at the issuer.`,
    );
  }
}

function requireHttpsUrl(value: string, subject: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${subject} must be an absolute HTTPS URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${subject} must be an absolute HTTPS URL.`);
  }

  return url;
}
