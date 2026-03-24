import type {
  CanvasEnvironment,
} from "./types.ts";
import { getPublicJwkSet } from "./tool_key.ts";
import { listCanvasPlatforms, resolveCanvasPlatform } from "./canvas_platform.ts";

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
  return listCanvasPlatforms().map((platform) => ({
    id: platform.environment,
    label: platform.environment === "production"
      ? "Production Canvas"
      : platform.environment === "beta"
      ? "Beta Canvas"
      : "Test Canvas",
    issuer: platform.issuer,
  }));
}

export function resolveCanvasIssuer(
  environment: CanvasEnvironment,
): string {
  return resolveCanvasPlatform(environment).issuer;
}

export function buildCanvasConfigUrl(appOrigin = requireAppOrigin()): string {
  return `${appOrigin}/lti/canvas/config.json`;
}

export function buildCanvasJwksUrl(appOrigin = requireAppOrigin()): string {
  return `${appOrigin}/lti/jwks.json`;
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
