import type { Capability, SubmissionMode, UserRole } from '../../sdk/app-sdk.ts';

export type CanvasEnvironment = 'production' | 'beta' | 'test';
export const LTI_AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
export const LTI_AGS_LINEITEM_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
export const LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
export const LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE = 'LtiResourceLinkRequest';
export const CANVAS_LTI_SCOPES = [
  LTI_AGS_SCORE_SCOPE,
  LTI_AGS_LINEITEM_SCOPE,
  LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
] as const;

export type LmsType = 'canvas' | 'moodle' | 'sakai';
export type NonCanvasLmsType = Exclude<LmsType, 'canvas'>;

export function buildLtiActivityResourceId(input: {
  appId: string;
  packageVersion: string;
  activityId: string;
}): string {
  return ['lantern', input.appId, input.packageVersion, input.activityId].join(':');
}

export interface CanvasDeploymentBinding {
  lms: 'canvas';
  issuer: string;
  clientId: string;
  deploymentId: string;
  canvasEnvironment: CanvasEnvironment;
}

export interface SharedPlatformBindingFields {
  issuer: string;
  clientId: string;
  deploymentId: string;
  authorizationEndpoint: string;
  accessTokenUrl: string;
  jwksUrl: string;
}

export type NonCanvasDeploymentBinding =
  | ({ lms: 'moodle' } & SharedPlatformBindingFields)
  | ({ lms: 'sakai' } & SharedPlatformBindingFields);

export type DeploymentBinding = CanvasDeploymentBinding | NonCanvasDeploymentBinding;

export interface CanvasPlatformConfig {
  environment: CanvasEnvironment;
  issuer: string;
  authorizationEndpoint: string;
  jwksUrl: string;
}

export interface LaunchAssignmentAndGradeServices {
  scope: string[];
  lineitemsUrl: string | null;
  lineitemUrl: string | null;
}

export interface LaunchNamesAndRolesService {
  contextMembershipsUrl: string;
  serviceVersions: string[];
}

export interface LaunchServiceClaims {
  ags: LaunchAssignmentAndGradeServices | null;
  nrps: LaunchNamesAndRolesService | null;
}

export interface RuntimeSessionRecord {
  sessionId: string;
  sessionToken: string;
  ltiToolSessionId: string | null;
  attemptId: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  capabilities: Capability[];
  snapshotRoot: string;
  entrypointPath: string;
  contentPath: string;
  services: LaunchServiceClaims;
  launch: {
    userRole: UserRole;
    courseId: string;
    assignmentId?: string;
    activityId: string;
    submissionMode: SubmissionMode;
  };
  preview: {
    previewSessionId: string;
  };
  createdAt: string;
  expiresAt: string;
}
