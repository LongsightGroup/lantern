import type { Capability, UserRole } from "../../sdk/app-sdk.ts";

export type CanvasEnvironment = "production" | "beta" | "test";

export interface DeploymentBinding {
  canvasEnvironment: CanvasEnvironment;
  issuer: string;
  clientId: string;
  deploymentId: string;
}

export interface CanvasPlatformConfig {
  environment: CanvasEnvironment;
  issuer: string;
  authorizationEndpoint: string;
  jwksUrl: string;
}

export interface LoginStateRecord extends DeploymentBinding {
  state: string;
  nonce: string;
  loginHint: string;
  targetLinkUri: string;
  ltiMessageHint: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface ValidatedLaunch extends DeploymentBinding {
  internalDeploymentId: number;
  internalDeploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  userId: string;
  userRole: UserRole;
  resourceLinkId: string;
  resourceLinkTitle: string | null;
  contextId: string | null;
  contextTitle: string | null;
  targetLinkUri: string;
  returnUrl: string | null;
  activityId: string;
  issuedAt: string;
}

export interface RuntimeSessionRecord {
  sessionId: string;
  sessionToken: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  capabilities: Capability[];
  snapshotRoot: string;
  entrypointPath: string;
  contentPath: string;
  launch: {
    userRole: UserRole;
    courseId: string;
    assignmentId?: string;
    activityId: string;
  };
  createdAt: string;
  expiresAt: string;
}
