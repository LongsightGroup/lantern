import type { Capability, UserRole } from '../../sdk/app-sdk.ts';

export type CanvasEnvironment = 'production' | 'beta' | 'test';
export const LTI_AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
export const LTI_AGS_LINEITEM_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
export const LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
export const LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE = 'LtiResourceLinkRequest';
export const LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE = 'LtiDeepLinkingRequest';
export const LTI_DEEP_LINKING_RESPONSE_MESSAGE_TYPE = 'LtiDeepLinkingResponse';
export const LTI_ASSIGNMENT_SELECTION_PLACEMENT = 'assignment_selection';
export const LTI_RESOURCE_SELECTION_PLACEMENT = 'resource_selection';
export const LANTERN_PLACEMENT_CUSTOM_KEY = 'lantern_placement_id';
export const CANVAS_LTI_SCOPES = [
  LTI_AGS_SCORE_SCOPE,
  LTI_AGS_LINEITEM_SCOPE,
  LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
] as const;

export type LmsType = 'canvas' | 'moodle' | 'sakai';
export type PersistedDeploymentLmsType = LmsType | 'preview';
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

export interface LoginStateRecord {
  lms: LmsType;
  canvasEnvironment: CanvasEnvironment | null;
  issuer: string;
  clientId: string;
  deploymentId: string;
  state: string;
  nonce: string;
  loginHint: string;
  targetLinkUri: string;
  ltiMessageHint: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface DynamicRegistrationStateRecord {
  state: string;
  appId: string;
  lms: LmsType;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
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

export interface ValidatedLaunch {
  lms: LmsType;
  canvasEnvironment: CanvasEnvironment | null;
  issuer: string;
  clientId: string;
  deploymentId: string;
  internalDeploymentId: number;
  internalDeploymentSlug: string;
  appId: string;
  packageVersionId: number;
  packageVersion: string;
  contentPath: string;
  attemptId: string;
  userId: string;
  userDisplayName: string | null;
  userEmail: string | null;
  userLogin: string | null;
  userRole: UserRole;
  resourceLinkId: string;
  resourceLinkTitle: string | null;
  contextId: string | null;
  contextTitle: string | null;
  targetLinkUri: string;
  returnUrl: string | null;
  activityId: string;
  services: LaunchServiceClaims;
  issuedAt: string;
}

export interface RuntimeSessionRecord {
  sessionId: string;
  sessionToken: string;
  attemptId: string;
  deploymentRecordId: number;
  deploymentSlug: string;
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
  };
  preview?: {
    previewSessionId: string;
  };
  createdAt: string;
  expiresAt: string;
}

export type DeepLinkingAcceptType = 'ltiResourceLink';
export type DeepLinkingPresentationDocumentTarget = 'iframe' | 'window' | 'embed';

export interface DeepLinkingSettings {
  acceptTypes: DeepLinkingAcceptType[];
  acceptMultiple: boolean;
  acceptPresentationDocumentTargets: DeepLinkingPresentationDocumentTarget[];
  acceptLineItem: boolean;
}

export type LtiMessageType =
  | typeof LTI_RESOURCE_LINK_REQUEST_MESSAGE_TYPE
  | typeof LTI_DEEP_LINKING_REQUEST_MESSAGE_TYPE;

export type LtiPlacement =
  | typeof LTI_ASSIGNMENT_SELECTION_PLACEMENT
  | typeof LTI_RESOURCE_SELECTION_PLACEMENT;

export interface ValidatedDeepLinkingRequest {
  lms: LmsType;
  canvasEnvironment: CanvasEnvironment | null;
  issuer: string;
  clientId: string;
  deploymentId: string;
  internalDeploymentId: number;
  internalDeploymentSlug: string;
  appId: string;
  userId: string | null;
  userRole: UserRole;
  contextId: string | null;
  contextTitle: string | null;
  targetLinkUri: string;
  deepLinkReturnUrl: string;
  data: string | null;
  placement: LtiPlacement;
  settings: DeepLinkingSettings;
  issuedAt: string;
}

export interface DeepLinkingSessionSelection {
  packageVersionId: number;
  packageVersion: string;
  activityId: string;
  contentPath: string;
}

export interface DeepLinkingSessionRecord {
  sessionId: string;
  sessionToken: string;
  deploymentRecordId: number;
  deploymentSlug: string;
  appId: string;
  userId: string | null;
  userRole: UserRole;
  contextId: string | null;
  contextTitle: string | null;
  deepLinkReturnUrl: string;
  data: string | null;
  placement: LtiPlacement;
  acceptTypes: DeepLinkingAcceptType[];
  acceptMultiple: boolean;
  acceptPresentationDocumentTargets: DeepLinkingPresentationDocumentTarget[];
  acceptLineItem: boolean;
  selection: DeepLinkingSessionSelection | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface DeepLinkingResponseLineItem {
  scoreMaximum: number;
  label: string;
  resourceId: string;
  tag: string;
}

export interface DeepLinkingResponseContentItem {
  type: 'ltiResourceLink';
  title: string;
  text: string;
  url: string;
  custom: Record<string, string>;
  lineItem?: DeepLinkingResponseLineItem;
  presentation?: {
    documentTarget: DeepLinkingPresentationDocumentTarget;
  };
}

export interface DeepLinkingResponseSubmission {
  returnUrl: string;
  jwt: string;
  formFields: {
    JWT: string;
  };
}
