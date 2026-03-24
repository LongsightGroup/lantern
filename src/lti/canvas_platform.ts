import type {
  CanvasEnvironment,
  CanvasPlatformConfig,
} from "./types.ts";

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

export function listCanvasPlatforms(): CanvasPlatformConfig[] {
  return [
    CANVAS_PLATFORMS.production,
    CANVAS_PLATFORMS.beta,
    CANVAS_PLATFORMS.test,
  ];
}

export function resolveCanvasPlatform(
  value: CanvasEnvironment | string,
): CanvasPlatformConfig {
  if (value === "production" || value === "beta" || value === "test") {
    return CANVAS_PLATFORMS[value];
  }

  const byIssuer = listCanvasPlatforms().find((platform) =>
    platform.issuer === value
  );

  if (byIssuer) {
    return byIssuer;
  }

  throw new Error(`Canvas issuer ${value} is not supported by Lantern.`);
}
