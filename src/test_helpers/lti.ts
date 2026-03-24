import { SignJWT, importJWK } from "jose";
import type {
  CanvasEnvironment,
  CanvasPlatformConfig,
  DeploymentBinding,
  LoginStateRecord,
  RuntimeSessionRecord,
  ValidatedLaunch,
} from "../lti/types.ts";

const TEST_NOW = "2026-03-23T22:45:00Z";

export const TEST_TOOL_PRIVATE_JWK = {
  kty: "EC",
  x: "4Cv5G2CYFD126Jr4ZRqnlbzPe9ZbX9J50-2Fy2ZObUk",
  y: "LYRIH1zr5ET6NcshC-9WgL7Ls68zEHYGEWDTYE_I6gk",
  crv: "P-256",
  d: "gwbcZMXfemRV5nb6FZI58qaVuIJmYzsLaw6433YEhYY",
} as const;

export const TEST_CANVAS_PRIVATE_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "JXShjYh1ejL3VEh8CVF9F7l0aIc07-Vcy7hkPw6hY4c",
  y: "Wj6L6TAjQY8sEg4HyN7iFOJp3TAqK1ybLV2cM5OQnxc",
  d: "l9qZP_3ROl8o8yA0m6cH9HScOBQ13jZ4fMvsqmoH5yQ",
  kid: "canvas-test-key",
  alg: "ES256",
  use: "sig",
} as const;

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

export interface CanvasLoginRequest {
  iss: string;
  loginHint: string;
  targetLinkUri: string;
  clientId: string;
  deploymentId: string;
  ltiMessageHint: string | null;
}

export interface CanvasLaunchTokenInput {
  deploymentBinding?: Partial<DeploymentBinding>;
  audience?: string;
  nonce?: string;
  subject?: string;
  targetLinkUri?: string;
  resourceLinkId?: string;
  resourceLinkTitle?: string;
  contextId?: string;
  contextTitle?: string;
  roles?: string[];
  returnUrl?: string;
}

export function buildDeploymentBinding(
  overrides: Partial<DeploymentBinding> = {},
): DeploymentBinding {
  const canvasEnvironment = overrides.canvasEnvironment ?? "production";
  const platform = TEST_CANVAS_PLATFORMS[canvasEnvironment];

  return {
    canvasEnvironment,
    issuer: overrides.issuer ?? platform.issuer,
    clientId: overrides.clientId ?? "10000000000001",
    deploymentId: overrides.deploymentId ?? "deployment-123",
  };
}

export function buildCanvasLoginRequest(
  overrides: Partial<CanvasLoginRequest> = {},
): CanvasLoginRequest {
  const bindingOverrides: Partial<DeploymentBinding> = {};
  if (overrides.iss !== undefined) {
    bindingOverrides.issuer = overrides.iss;
  }
  if (overrides.clientId !== undefined) {
    bindingOverrides.clientId = overrides.clientId;
  }
  if (overrides.deploymentId !== undefined) {
    bindingOverrides.deploymentId = overrides.deploymentId;
  }
  const binding = buildDeploymentBinding(bindingOverrides);

  return {
    iss: binding.issuer,
    loginHint: overrides.loginHint ?? "opaque-login-hint",
    targetLinkUri: overrides.targetLinkUri ??
      "http://localhost:8000/lti/launch",
    clientId: overrides.clientId ?? binding.clientId,
    deploymentId: overrides.deploymentId ?? binding.deploymentId,
    ltiMessageHint: overrides.ltiMessageHint ?? "message-hint-123",
  };
}

export function buildLoginStateRecord(
  overrides: Partial<LoginStateRecord> = {},
): LoginStateRecord {
  const bindingOverrides: Partial<DeploymentBinding> = {};
  if (overrides.canvasEnvironment !== undefined) {
    bindingOverrides.canvasEnvironment = overrides.canvasEnvironment;
  }
  if (overrides.issuer !== undefined) {
    bindingOverrides.issuer = overrides.issuer;
  }
  if (overrides.clientId !== undefined) {
    bindingOverrides.clientId = overrides.clientId;
  }
  if (overrides.deploymentId !== undefined) {
    bindingOverrides.deploymentId = overrides.deploymentId;
  }
  const binding = buildDeploymentBinding(bindingOverrides);

  return {
    state: overrides.state ?? "state-123",
    nonce: overrides.nonce ?? "nonce-123",
    loginHint: overrides.loginHint ?? "opaque-login-hint",
    targetLinkUri: overrides.targetLinkUri ??
      "http://localhost:8000/lti/launch",
    ltiMessageHint: overrides.ltiMessageHint ?? "message-hint-123",
    createdAt: overrides.createdAt ?? TEST_NOW,
    expiresAt: overrides.expiresAt ?? "2026-03-23T22:50:00Z",
    usedAt: overrides.usedAt ?? null,
    ...binding,
  };
}

export function buildValidatedLaunch(
  overrides: Partial<ValidatedLaunch> = {},
): ValidatedLaunch {
  const bindingOverrides: Partial<DeploymentBinding> = {};
  if (overrides.canvasEnvironment !== undefined) {
    bindingOverrides.canvasEnvironment = overrides.canvasEnvironment;
  }
  if (overrides.issuer !== undefined) {
    bindingOverrides.issuer = overrides.issuer;
  }
  if (overrides.clientId !== undefined) {
    bindingOverrides.clientId = overrides.clientId;
  }
  if (overrides.deploymentId !== undefined) {
    bindingOverrides.deploymentId = overrides.deploymentId;
  }
  const binding = buildDeploymentBinding(bindingOverrides);

  return {
    internalDeploymentId: overrides.internalDeploymentId ?? 1,
    internalDeploymentSlug: overrides.internalDeploymentSlug ??
      "chapter-4-asteroids-pilot",
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    userId: overrides.userId ?? "canvas-user-123",
    userRole: overrides.userRole ?? "learner",
    resourceLinkId: overrides.resourceLinkId ?? "resource-link-123",
    resourceLinkTitle: overrides.resourceLinkTitle ?? "Chapter 4 Asteroids",
    contextId: overrides.contextId ?? "course-42",
    contextTitle: overrides.contextTitle ?? "Physics 101",
    targetLinkUri: overrides.targetLinkUri ??
      "http://localhost:8000/lti/launch",
    returnUrl: overrides.returnUrl ?? "https://canvas.example/return",
    activityId: overrides.activityId ?? "activity-123",
    issuedAt: overrides.issuedAt ?? TEST_NOW,
    ...binding,
  };
}

export function buildRuntimeSessionRecord(
  overrides: Partial<RuntimeSessionRecord> = {},
): RuntimeSessionRecord {
  return {
    sessionId: overrides.sessionId ?? "runtime-session-123",
    sessionToken: overrides.sessionToken ?? "runtime-token-123",
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? "chapter-4-asteroids-pilot",
    appId: overrides.appId ?? "chapter-4-asteroids",
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? "0.1.0",
    capabilities: overrides.capabilities ?? [
      "read_launch_context",
      "read_activity_content",
      "submit_attempt_event",
      "finalize_attempt",
      "read_local_state",
      "write_local_state",
    ],
    snapshotRoot: overrides.snapshotRoot ??
      "var/packages/chapter-4-asteroids/0.1.0",
    entrypointPath: overrides.entrypointPath ??
      "var/packages/chapter-4-asteroids/0.1.0/dist/index.html",
    contentPath: overrides.contentPath ??
      "var/packages/chapter-4-asteroids/0.1.0/content/activity.json",
    launch: overrides.launch ?? {
      userRole: "learner",
      courseId: "course-42",
      assignmentId: "assignment-9",
      activityId: "activity-123",
    },
    createdAt: overrides.createdAt ?? TEST_NOW,
    expiresAt: overrides.expiresAt ?? "2026-03-23T22:47:00Z",
  };
}

export async function signCanvasIdToken(
  input: CanvasLaunchTokenInput = {},
): Promise<string> {
  const binding = buildDeploymentBinding(input.deploymentBinding ?? {});
  const claims = {
    nonce: input.nonce ?? "nonce-123",
    "https://purl.imsglobal.org/spec/lti/claim/message_type":
      "LtiResourceLinkRequest",
    "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id":
      binding.deploymentId,
    "https://purl.imsglobal.org/spec/lti/claim/target_link_uri":
      input.targetLinkUri ?? "http://localhost:8000/lti/launch",
    "https://purl.imsglobal.org/spec/lti/claim/resource_link": {
      id: input.resourceLinkId ?? "resource-link-123",
      title: input.resourceLinkTitle ?? "Chapter 4 Asteroids",
    },
    "https://purl.imsglobal.org/spec/lti/claim/context": {
      id: input.contextId ?? "course-42",
      title: input.contextTitle ?? "Physics 101",
    },
    "https://purl.imsglobal.org/spec/lti/claim/launch_presentation": {
      document_target: "iframe",
      return_url: input.returnUrl ?? "https://canvas.example/return",
    },
    "https://purl.imsglobal.org/spec/lti/claim/roles": input.roles ?? [
      "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner",
    ],
  };
  const signingKey = await importJWK(TEST_CANVAS_PRIVATE_JWK, "ES256");

  return await new SignJWT(claims)
    .setProtectedHeader({
      alg: "ES256",
      kid: TEST_CANVAS_PRIVATE_JWK.kid,
      typ: "JWT",
    })
    .setIssuer(binding.issuer)
    .setAudience(input.audience ?? binding.clientId)
    .setSubject(input.subject ?? "canvas-user-123")
    .setIssuedAt(Math.floor(Date.parse(TEST_NOW) / 1000))
    .setExpirationTime("5m")
    .setJti("launch-jti-123")
    .sign(signingKey);
}

export function getTestCanvasJwks(): {
  keys: [typeof TEST_CANVAS_PRIVATE_JWK];
} {
  return {
    keys: [TEST_CANVAS_PRIVATE_JWK],
  };
}

export function getTestToolPrivateJwkEnvValue(): string {
  return JSON.stringify(TEST_TOOL_PRIVATE_JWK);
}
