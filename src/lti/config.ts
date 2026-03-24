import type {
  CanvasEnvironment,
  CanvasPlatformConfig,
} from "./types.ts";
import { getPublicJwkSet } from "./tool_key.ts";

export interface CanvasEnvironmentOption {
  id: CanvasEnvironment;
  label: string;
  issuer: string;
}

export interface CanvasConfigDocument {
  title: string;
  description: string;
  oidc_initiation_url: string;
  target_link_uri: string;
  public_jwk_url: string;
  redirect_uris: string[];
  extensions: Array<{
    domain: string;
    tool_id: string;
    platform: string;
    privacy_level: "public";
    settings: {
      text: string;
      placements: Array<{
        placement: "course_navigation";
        message_type: "LtiResourceLinkRequest";
        target_link_uri: string;
        text: string;
      }>;
    };
  }>;
}

const APP_ORIGIN_ENV = "APP_ORIGIN";

const CANVAS_PLATFORMS: Record<CanvasEnvironment, CanvasPlatformConfig> = {
  production: {
    environment: "production",
    issuer: "https://canvas.instructure.com",
    authorizationEndpoint:
      "https://sso.canvaslms.com/api/lti/authorize_redirect",
    jwksUrl: "https://sso.canvaslms.com/api/lti/security/jwks",
  },
  beta: {
    environment: "beta",
    issuer: "https://canvas.beta.instructure.com",
    authorizationEndpoint:
      "https://sso.beta.canvaslms.com/api/lti/authorize_redirect",
    jwksUrl: "https://sso.beta.canvaslms.com/api/lti/security/jwks",
  },
  test: {
    environment: "test",
    issuer: "https://canvas.test.instructure.com",
    authorizationEndpoint:
      "https://sso.test.canvaslms.com/api/lti/authorize_redirect",
    jwksUrl: "https://sso.test.canvaslms.com/api/lti/security/jwks",
  },
};

export function requireAppOrigin(): string {
  const appOrigin = Deno.env.get(APP_ORIGIN_ENV)?.trim();

  if (!appOrigin) {
    throw new Error(
      `${APP_ORIGIN_ENV} is required to publish Lantern's Canvas config and launch URLs.`,
    );
  }

  return appOrigin.endsWith("/") ? appOrigin.slice(0, -1) : appOrigin;
}

export function listCanvasEnvironments(): CanvasEnvironmentOption[] {
  return [
    {
      id: "production",
      label: "Production Canvas",
      issuer: CANVAS_PLATFORMS.production.issuer,
    },
    {
      id: "beta",
      label: "Beta Canvas",
      issuer: CANVAS_PLATFORMS.beta.issuer,
    },
    {
      id: "test",
      label: "Test Canvas",
      issuer: CANVAS_PLATFORMS.test.issuer,
    },
  ];
}

export function resolveCanvasIssuer(
  environment: CanvasEnvironment,
): string {
  return CANVAS_PLATFORMS[environment].issuer;
}

export function buildCanvasConfigUrl(appOrigin = requireAppOrigin()): string {
  return `${appOrigin}/lti/canvas/config.json`;
}

export function buildCanvasJwksUrl(appOrigin = requireAppOrigin()): string {
  return `${appOrigin}/lti/jwks.json`;
}

export function resolveCanvasPlatform(
  environment: CanvasEnvironment,
): CanvasPlatformConfig {
  return CANVAS_PLATFORMS[environment];
}

export async function buildCanvasConfigDocument(
  appOrigin = requireAppOrigin(),
): Promise<CanvasConfigDocument> {
  const origin = new URL(appOrigin);
  const launchUrl = `${appOrigin}/lti/launch`;

  await getPublicJwkSet();

  return {
    title: "Lantern Demo Broker",
    description:
      "Launch one reviewed Lantern app through a governed Canvas LTI 1.3 path.",
    oidc_initiation_url: `${appOrigin}/lti/login`,
    target_link_uri: launchUrl,
    public_jwk_url: buildCanvasJwksUrl(appOrigin),
    redirect_uris: [launchUrl],
    extensions: [
      {
        domain: origin.host,
        tool_id: "lantern-demo-broker",
        platform: "canvas.instructure.com",
        privacy_level: "public",
        settings: {
          text: "Lantern Demo",
          placements: [
            {
              placement: "course_navigation",
              message_type: "LtiResourceLinkRequest",
              target_link_uri: launchUrl,
              text: "Lantern Demo",
            },
          ],
        },
      },
    ],
  };
}

export function parseCanvasEnvironment(
  value: FormDataEntryValue | null,
): CanvasEnvironment {
  if (value === "production" || value === "beta" || value === "test") {
    return value;
  }

  throw new Error(
    "Choose one supported Canvas environment before you save the deployment binding.",
  );
}
