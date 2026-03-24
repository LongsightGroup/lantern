import { importJWK, SignJWT } from "jose";
import type {
  CanvasEnvironment,
  CanvasPlatformConfig,
  DeploymentBinding,
  LaunchAssignmentAndGradeServices,
  LaunchNamesAndRolesService,
  LaunchServiceClaims,
  LoginStateRecord,
  RuntimeSessionRecord,
  ValidatedLaunch,
} from "../lti/types.ts";
import {
  LTI_AGS_LINEITEM_SCOPE as DEFAULT_AGS_LINEITEM_SCOPE,
  LTI_AGS_SCORE_SCOPE as DEFAULT_AGS_SCORE_SCOPE,
} from "../lti/types.ts";

const TEST_NOW = "2026-03-23T22:45:00Z";

export const TEST_TOOL_PRIVATE_JWK = {
  kty: "RSA",
  alg: "RS256",
  n: "uqAz51P9MxAXrvGI_6QMTdFQhpUqjLtialtYuIvFkJaB98npMnFuBMfMpXH0vTEWlyTWNencpsco4t0X4PBVEk7n3kol3JvRSGqNSotQ0lx4omi9qeCNljAWiSc6FyEn-FfWOxwKwQZxhbgBclBxsVQqrHAtcADA2pUzG9HzZaPmNLHyZ7zzr3D8PNIEM2qmqhUp9cm1UTZu8iJg6B7X-Jcazpa5N_nbkYIwAjyE6iep4IP4HoRIxOSoewdmxyEhtii7a-wz6bGVICht0cOegTe1mmZIo7xQHvz0I4v0y2xkhfCBCOEI8HeGWiGU95_KazbNdC_qZyIsGDqLndTigw",
  e: "AQAB",
  d: "G38vJo5BaBye4K_Ft6S8C1sjujCQLFwPjAwZbldprHwAejnNmhkMVLf7dwTrQlTRN0O-LANg91GwvHxG4GWIo0Hs99uE6JQsqbbJSopsRhJJ0-QKzdTAB7jeGScmb_H6qaSHc_4Vt4rzfvg1flpL5gy4nN-KUk5KG-qPtTGh4v-aqkfzkxVnEBb-VfB_o5nafMimKp1TMXSPcL-4NjjwFioP8YcQDYxwKJGHHm7_CqSfCu5AMx7UByVxsVFNTsaua0lFUQDaVR13eHFFOdUZiAUe97Ua_JYec6Gxe4-3g1bCmGbGm9U_35fGM5kt4NXWND0ULgJfI8alAUDjxblQQQ",
  p: "2WhfV1qBXbQwL5tW6GaD-nKaZYfGoOOgyKQKjtV7UIBWXECOiciIHxUMoSQrmtbtNLg64K58FLBZ11loOyoso1351MfsQB6FzZfF_zkHlfcNKuWLphwTizTv61TC4_r-5lsoQ5CI34UzzSZaY50AjHg2n6_ahUbTqsYyCmG9Rzc",
  q: "28EDIGEyaKjMnMdD0NJgQSTxrMzwQujRpioPGWRD6y3ADVwA7p-u4XhiekuOwRjbmyJrJ_HcUna0J0ZydFwo9KRVfIhDhcUGioEnUatWWaMEZDBl6RzyEutR1H4oNx9fjJykNcP13O-fMgHzsZ5k8Oc_lZy1wyJGNnQGQChxzRU",
  dp:
    "r3QWDY9S--ZhROpeduvU8xfuFqY-3LUXmxUYGDGddVg9WfIXloappDv-l0Vzk2CEypkrmwv1w1SXDL5w6d6da7J53wkBVrXLUiJ8ff7uak6Y59ecng_mjd_JB-i95_M2J33FvtE0RP9g0N108RNR0AtsOe9XsVt5k0akN9CtSn0",
  dq:
    "2KD7kQbf53ZHRmHUw10vz-g4aa0ZSAw054Xcnp5Nqd_OzByfOpyli9Td10r2rfnwOo0Cbz0ogQ5NZ841c-mJ4ijBsOKvFYZ1fUH2Xbb2h6SA5rcjL1r-c5IQd9XplPVTfszHv8yuaR66o1RzQ-wt-6Eq-DSkpXj7GCDmLIbyMEU",
  qi:
    "X9i7s0LnslcujfZlwBXIbpEU6lz7P11_DPID3j24OhzSTXCadpL7tLLOGG3LuHKx4-izFsVVcrCJ4xnYAG7rwvOVrGm-DTyPrA7AmopnZJ9xxJC2NmDbQc-xVykeSdgUGRl7YkitHdfsmUn6Biy738ihxbGYaZMDd3fRW9hssio",
  use: "sig",
} as const;

export const TEST_CANVAS_PRIVATE_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "Fgb7eS3YhjqEBd7cgS6DsI6-03QFxuRwQsYgg-ouGcw",
  y: "5Oz3PTCdqSCgyjivrUo7O-OU3Pke-c4F0wsTDHthhdk",
  d: "sANZQwLQiOe9yhkHkeU6LugbEM_GZdNgx6dFIKEOsdk",
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
  messageType?: string;
  version?: string;
  issuedAt?: string;
  expirationTime?: string;
  targetLinkUri?: string;
  resourceLinkId?: string;
  resourceLinkTitle?: string;
  contextId?: string;
  contextTitle?: string;
  roles?: string[];
  returnUrl?: string;
  ags?: Partial<LaunchAssignmentAndGradeServices> | null;
  agsShape?: "lineitem" | "lineitems" | "both" | "none";
  nrps?: Partial<LaunchNamesAndRolesService> | null;
}

export interface ToolClientAssertionInput {
  issuer?: string;
  subject?: string;
  audience?: string;
  issuedAt?: string;
  expirationTime?: string;
  jwtId?: string;
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

export function buildAgsLaunchService(
  overrides: Partial<LaunchAssignmentAndGradeServices> = {},
  shape: CanvasLaunchTokenInput["agsShape"] = "both",
): LaunchAssignmentAndGradeServices {
  return {
    scope: overrides.scope ?? [
      DEFAULT_AGS_SCORE_SCOPE,
      DEFAULT_AGS_LINEITEM_SCOPE,
    ],
    lineitemsUrl: shape === "lineitem" || shape === "none"
      ? null
      : overrides.lineitemsUrl ??
        "https://canvas.example/api/lti/courses/42/line_items",
    lineitemUrl: shape === "lineitems" || shape === "none"
      ? null
      : overrides.lineitemUrl ??
        "https://canvas.example/api/lti/courses/42/line_items/9",
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
    agsShape?: CanvasLaunchTokenInput["agsShape"];
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
  shape: CanvasLaunchTokenInput["agsShape"] = "both",
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
    attemptId: overrides.attemptId ?? "attempt-123",
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
    services: overrides.services ?? buildLaunchServiceClaims(),
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
    attemptId: overrides.attemptId ?? "attempt-123",
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
    services: overrides.services ?? buildLaunchServiceClaims(),
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
  const agsClaim = input.ags === null
    ? null
    : buildAgsLaunchClaimValue(input.ags ?? {}, input.agsShape);
  const nrpsClaim = input.nrps === null
    ? null
    : buildNrpsLaunchClaimValue(input.nrps ?? {});
  const claims = {
    nonce: input.nonce ?? "nonce-123",
    "https://purl.imsglobal.org/spec/lti/claim/message_type":
      input.messageType ?? "LtiResourceLinkRequest",
    "https://purl.imsglobal.org/spec/lti/claim/version": input.version ??
      "1.3.0",
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
    ...(agsClaim === null ? {} : {
      "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": agsClaim,
    }),
    ...(nrpsClaim === null ? {} : {
      "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice":
        nrpsClaim,
    }),
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
    .setIssuedAt(
      Math.floor(Date.parse(input.issuedAt ?? TEST_NOW) / 1000),
    )
    .setExpirationTime(input.expirationTime ?? "5m")
    .setJti("launch-jti-123")
    .sign(signingKey);
}

export function getTestCanvasJwks(): {
  keys: [{
    kty: string;
    crv: string;
    x: string;
    y: string;
    kid: string;
    alg: string;
    use: string;
  }];
} {
  return {
    keys: [{
      kty: TEST_CANVAS_PRIVATE_JWK.kty,
      crv: TEST_CANVAS_PRIVATE_JWK.crv,
      x: TEST_CANVAS_PRIVATE_JWK.x,
      y: TEST_CANVAS_PRIVATE_JWK.y,
      kid: TEST_CANVAS_PRIVATE_JWK.kid,
      alg: TEST_CANVAS_PRIVATE_JWK.alg,
      use: TEST_CANVAS_PRIVATE_JWK.use,
    }],
  };
}

export function getTestToolPrivateJwkEnvValue(): string {
  return JSON.stringify(TEST_TOOL_PRIVATE_JWK);
}

export function buildToolClientAssertionClaims(
  input: ToolClientAssertionInput = {},
): {
  iss: string;
  sub: string;
  aud: string;
  jti: string;
} {
  const issuer = input.issuer ?? "10000000000001";
  const subject = input.subject ?? issuer;

  return {
    iss: issuer,
    sub: subject,
    aud: input.audience ??
      "https://canvas.example/login/oauth2/token",
    jti: input.jwtId ?? "tool-client-assertion-123",
  };
}

export async function signToolClientAssertion(
  input: ToolClientAssertionInput = {},
): Promise<string> {
  const claims = buildToolClientAssertionClaims(input);
  const signingKey = await importJWK(TEST_TOOL_PRIVATE_JWK, "RS256");

  return await new SignJWT({})
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
    })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setJti(claims.jti)
    .setIssuedAt(
      Math.floor(Date.parse(input.issuedAt ?? TEST_NOW) / 1000),
    )
    .setExpirationTime(input.expirationTime ?? "5m")
    .sign(signingKey);
}
