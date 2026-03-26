import type {
  CanvasDeploymentBinding,
  CanvasEnvironment,
  CanvasPlatformConfig,
  LaunchAssignmentAndGradeServices,
  LaunchNamesAndRolesService,
  LaunchServiceClaims,
  LmsType,
  LoginStateRecord,
} from "../lti/types.ts";
import type { LoginRequest } from "../lti/login.ts";
import {
  LTI_AGS_LINEITEM_SCOPE as DEFAULT_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE as DEFAULT_AGS_SCORE_SCOPE,
} from "../lti/types.ts";

export const TEST_NOW = "2026-03-23T22:45:00Z";

export const TEST_CANVAS_PLATFORMS: Record<
  CanvasEnvironment,
  CanvasPlatformConfig
> = {
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

export type AgsShape = "lineitem" | "lineitems" | "both" | "none";

export function buildCanvasDeploymentBinding(
  overrides: Partial<CanvasDeploymentBinding> = {},
): CanvasDeploymentBinding {
  const canvasEnvironment = overrides.canvasEnvironment ?? "production";
  const platform = TEST_CANVAS_PLATFORMS[canvasEnvironment];

  return {
    lms: "canvas",
    canvasEnvironment,
    issuer: overrides.issuer ?? platform.issuer,
    clientId: overrides.clientId ?? "10000000000001",
    deploymentId: overrides.deploymentId ?? "deployment-123",
  };
}

export function buildMoodleDeploymentBinding(
  overrides: Partial<{
    issuer: string;
    clientId: string;
    deploymentId: string;
    authenticationRequestUrl: string;
    accessTokenUrl: string;
    jwksUrl: string;
  }> = {},
) {
  return {
    lms: "moodle" as const,
    issuer: overrides.issuer ?? "https://moodle.example",
    clientId: overrides.clientId ?? "moodle-client-123",
    deploymentId: overrides.deploymentId ?? "moodle-deployment-123",
    authenticationRequestUrl: overrides.authenticationRequestUrl ??
      "https://moodle.example/mod/lti/auth.php",
    accessTokenUrl: overrides.accessTokenUrl ??
      "https://moodle.example/mod/lti/token.php",
    jwksUrl: overrides.jwksUrl ?? "https://moodle.example/mod/lti/certs.php",
  };
}

export function buildSakaiDeploymentBinding(
  overrides: Partial<{
    issuer: string;
    clientId: string;
    deploymentId: string;
    oidcAuthenticationUrl: string;
    accessTokenUrl: string;
    jwksUrl: string;
  }> = {},
) {
  return {
    lms: "sakai" as const,
    issuer: overrides.issuer ?? "https://sakai.example",
    clientId: overrides.clientId ?? "sakai-client-123",
    deploymentId: overrides.deploymentId ?? "sakai-deployment-123",
    oidcAuthenticationUrl: overrides.oidcAuthenticationUrl ??
      "https://sakai.example/imsoidc/lti13/oidc_auth",
    accessTokenUrl: overrides.accessTokenUrl ??
      "https://sakai.example/imsblis/lti13/token/3",
    jwksUrl: overrides.jwksUrl ?? "https://sakai.example/imsblis/lti13/keyset",
  };
}

export function buildDeploymentBinding(
  overrides: Partial<CanvasDeploymentBinding> = {},
): CanvasDeploymentBinding {
  return buildCanvasDeploymentBinding(overrides);
}

export function buildPlatformIdentity(overrides: Partial<{
  lms: LmsType;
  canvasEnvironment: CanvasEnvironment | null;
  issuer: string;
  clientId: string;
  deploymentId: string;
}> = {}): Pick<
  LoginStateRecord,
  "lms" | "canvasEnvironment" | "issuer" | "clientId" | "deploymentId"
> {
  const lms = overrides.lms ?? "canvas";

  switch (lms) {
    case "canvas": {
      const binding = buildCanvasDeploymentBinding({
        ...(overrides.canvasEnvironment === undefined ||
            overrides.canvasEnvironment === null
          ? {}
          : { canvasEnvironment: overrides.canvasEnvironment }),
        ...(overrides.issuer === undefined ? {} : { issuer: overrides.issuer }),
        ...(overrides.clientId === undefined
          ? {}
          : { clientId: overrides.clientId }),
        ...(overrides.deploymentId === undefined
          ? {}
          : { deploymentId: overrides.deploymentId }),
      });

      return {
        lms: binding.lms,
        canvasEnvironment: binding.canvasEnvironment,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      };
    }
    case "moodle": {
      const binding = buildMoodleDeploymentBinding({
        ...(overrides.issuer === undefined ? {} : { issuer: overrides.issuer }),
        ...(overrides.clientId === undefined
          ? {}
          : { clientId: overrides.clientId }),
        ...(overrides.deploymentId === undefined
          ? {}
          : { deploymentId: overrides.deploymentId }),
      });

      return {
        lms: binding.lms,
        canvasEnvironment: null,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      };
    }
    case "sakai": {
      const binding = buildSakaiDeploymentBinding({
        ...(overrides.issuer === undefined ? {} : { issuer: overrides.issuer }),
        ...(overrides.clientId === undefined
          ? {}
          : { clientId: overrides.clientId }),
        ...(overrides.deploymentId === undefined
          ? {}
          : { deploymentId: overrides.deploymentId }),
      });

      return {
        lms: binding.lms,
        canvasEnvironment: null,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      };
    }
  }
}

export function buildCanvasLoginRequest(
  overrides: Partial<LoginRequest> = {},
): LoginRequest {
  const identity = buildPlatformIdentity({
    lms: "canvas",
    ...(overrides.iss === undefined ? {} : { issuer: overrides.iss }),
    ...(overrides.clientId === undefined
      ? {}
      : { clientId: overrides.clientId }),
    ...(overrides.deploymentId === undefined
      ? {}
      : { deploymentId: overrides.deploymentId }),
  });

  return {
    iss: identity.issuer,
    loginHint: overrides.loginHint ?? "opaque-login-hint",
    targetLinkUri: overrides.targetLinkUri ??
      "http://localhost:8417/lti/launch",
    clientId: identity.clientId,
    deploymentId: identity.deploymentId,
    ltiMessageHint: overrides.ltiMessageHint ?? "message-hint-123",
  };
}

export function buildSakaiLoginRequest(
  overrides: Partial<LoginRequest> = {},
): LoginRequest {
  const identity = buildPlatformIdentity({
    lms: "sakai",
    ...(overrides.iss === undefined ? {} : { issuer: overrides.iss }),
    ...(overrides.clientId === undefined
      ? {}
      : { clientId: overrides.clientId }),
    ...(overrides.deploymentId === undefined
      ? {}
      : { deploymentId: overrides.deploymentId }),
  });

  return {
    iss: identity.issuer,
    loginHint: overrides.loginHint ?? "opaque-login-hint",
    targetLinkUri: overrides.targetLinkUri ??
      "http://localhost:8417/lti/launch",
    clientId: identity.clientId,
    deploymentId: identity.deploymentId,
    ltiMessageHint: overrides.ltiMessageHint ?? "message-hint-123",
  };
}

export function buildLoginStateRecord(
  overrides: Partial<LoginStateRecord> = {},
): LoginStateRecord {
  const identity = buildPlatformIdentity({
    ...(overrides.lms === undefined ? {} : { lms: overrides.lms }),
    ...(overrides.canvasEnvironment === undefined
      ? {}
      : { canvasEnvironment: overrides.canvasEnvironment }),
    ...(overrides.issuer === undefined ? {} : { issuer: overrides.issuer }),
    ...(overrides.clientId === undefined
      ? {}
      : { clientId: overrides.clientId }),
    ...(overrides.deploymentId === undefined
      ? {}
      : { deploymentId: overrides.deploymentId }),
  });

  return {
    state: overrides.state ?? "state-123",
    nonce: overrides.nonce ?? "nonce-123",
    loginHint: overrides.loginHint ?? "opaque-login-hint",
    targetLinkUri: overrides.targetLinkUri ??
      "http://localhost:8417/lti/launch",
    ltiMessageHint: overrides.ltiMessageHint ?? "message-hint-123",
    createdAt: overrides.createdAt ?? TEST_NOW,
    expiresAt: overrides.expiresAt ?? "2026-03-23T22:50:00Z",
    usedAt: overrides.usedAt ?? null,
    ...identity,
  };
}

export function buildAgsLaunchService(
  overrides: Partial<LaunchAssignmentAndGradeServices> = {},
  shape: AgsShape = "both",
): LaunchAssignmentAndGradeServices {
  return {
    scope: overrides.scope ??
      [DEFAULT_AGS_SCORE_SCOPE, DEFAULT_AGS_LINEITEM_SCOPE],
    lineitemsUrl: shape === "lineitem" || shape === "none"
      ? null
      : (overrides.lineitemsUrl ??
        "https://canvas.example/api/lti/courses/42/line_items"),
    lineitemUrl: shape === "lineitems" || shape === "none"
      ? null
      : (overrides.lineitemUrl ??
        "https://canvas.example/api/lti/courses/42/line_items/9"),
  };
}

export function buildNrpsLaunchService(
  overrides: Partial<LaunchNamesAndRolesService> = {},
): LaunchNamesAndRolesService {
  return {
    contextMembershipsUrl: overrides.contextMembershipsUrl ??
      "https://canvas.example/api/lti/courses/42/names_and_roles",
    serviceVersions: overrides.serviceVersions ?? ["2.0"],
  };
}

export function buildLaunchServiceClaims(
  overrides: Partial<LaunchServiceClaims> & {
    agsShape?: AgsShape;
  } = {},
): LaunchServiceClaims {
  return {
    ags: overrides.ags === null
      ? null
      : buildAgsLaunchService(overrides.ags ?? {}, overrides.agsShape),
    nrps: overrides.nrps === null
      ? null
      : buildNrpsLaunchService(overrides.nrps ?? {}),
  };
}

export function buildAgsLaunchClaimValue(
  overrides: Partial<LaunchAssignmentAndGradeServices> = {},
  shape: AgsShape = "both",
): Record<string, unknown> {
  const service = buildAgsLaunchService(overrides, shape);

  return {
    scope: service.scope,
    ...(service.lineitemsUrl === null
      ? {}
      : { lineitems: service.lineitemsUrl }),
    ...(service.lineitemUrl === null ? {} : { lineitem: service.lineitemUrl }),
  };
}

export function buildNrpsLaunchClaimValue(
  overrides: Partial<LaunchNamesAndRolesService> = {},
): Record<string, unknown> {
  const service = buildNrpsLaunchService(overrides);

  return {
    context_memberships_url: service.contextMembershipsUrl,
    service_versions: service.serviceVersions,
  };
}
