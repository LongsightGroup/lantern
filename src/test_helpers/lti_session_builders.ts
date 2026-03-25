import type {
  DeepLinkingSessionRecord,
  DeploymentBinding,
  RuntimeSessionRecord,
  ValidatedDeepLinkingRequest,
  ValidatedLaunch,
} from '../lti/types.ts';
import { LTI_ASSIGNMENT_SELECTION_PLACEMENT as DEFAULT_ASSIGNMENT_SELECTION_PLACEMENT } from '../lti/types.ts';
import {
  buildDeploymentBinding,
  buildLaunchServiceClaims,
  TEST_NOW,
} from './lti_identity_builders.ts';

export function buildValidatedLaunch(overrides: Partial<ValidatedLaunch> = {}): ValidatedLaunch {
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
    internalDeploymentSlug: overrides.internalDeploymentSlug ?? 'chapter-4-asteroids-pilot',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? '0.1.0',
    contentPath: overrides.contentPath ?? '/content/activity.json',
    attemptId: overrides.attemptId ?? 'attempt-123',
    userId: overrides.userId ?? 'canvas-user-123',
    userRole: overrides.userRole ?? 'learner',
    resourceLinkId: overrides.resourceLinkId ?? 'resource-link-123',
    resourceLinkTitle: overrides.resourceLinkTitle ?? 'Chapter 4 Asteroids',
    contextId: overrides.contextId ?? 'course-42',
    contextTitle: overrides.contextTitle ?? 'Physics 101',
    targetLinkUri: overrides.targetLinkUri ?? 'http://localhost:8000/lti/launch',
    returnUrl: overrides.returnUrl ?? 'https://canvas.example/return',
    activityId: overrides.activityId ?? 'activity-123',
    services: overrides.services ?? buildLaunchServiceClaims(),
    issuedAt: overrides.issuedAt ?? TEST_NOW,
    ...binding,
  };
}

export function buildDeepLinkingSettingsClaimValue(
  input: {
    acceptTypes?: string[] | undefined;
    acceptMultiple?: boolean | undefined;
    acceptPresentationDocumentTargets?: string[] | undefined;
    acceptLineItem?: boolean | undefined;
    deepLinkReturnUrl?: string | undefined;
    data?: string | null | undefined;
  } = {},
): Record<string, unknown> {
  return {
    accept_types: input.acceptTypes ?? ['ltiResourceLink'],
    accept_multiple: input.acceptMultiple ?? false,
    accept_presentation_document_targets: input.acceptPresentationDocumentTargets ?? ['iframe'],
    accept_lineitem: input.acceptLineItem ?? false,
    deep_link_return_url:
      input.deepLinkReturnUrl ?? 'https://canvas.example/courses/42/deep_link_return',
    ...(input.data === undefined ? {} : { data: input.data }),
  };
}

export function buildValidatedDeepLinkingRequest(
  overrides: Partial<ValidatedDeepLinkingRequest> = {},
): ValidatedDeepLinkingRequest {
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
    internalDeploymentSlug: overrides.internalDeploymentSlug ?? 'chapter-4-asteroids-pilot',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    userId: overrides.userId ?? 'canvas-user-123',
    userRole: overrides.userRole ?? 'instructor',
    contextId: overrides.contextId ?? 'course-42',
    contextTitle: overrides.contextTitle ?? 'Physics 101',
    targetLinkUri: overrides.targetLinkUri ?? 'http://localhost:8000/lti/deep-linking',
    deepLinkReturnUrl:
      overrides.deepLinkReturnUrl ?? 'https://canvas.example/courses/42/deep_link_return',
    data: overrides.data ?? 'deep-linking-state-token',
    placement: overrides.placement ?? DEFAULT_ASSIGNMENT_SELECTION_PLACEMENT,
    settings: overrides.settings ?? {
      acceptTypes: ['ltiResourceLink'],
      acceptMultiple: false,
      acceptPresentationDocumentTargets: ['iframe'],
      acceptLineItem: false,
    },
    issuedAt: overrides.issuedAt ?? TEST_NOW,
    ...binding,
  };
}

export function buildRuntimeSessionRecord(
  overrides: Partial<RuntimeSessionRecord> = {},
): RuntimeSessionRecord {
  return {
    sessionId: overrides.sessionId ?? 'runtime-session-123',
    sessionToken: overrides.sessionToken ?? 'runtime-token-123',
    attemptId: overrides.attemptId ?? 'attempt-123',
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? 'chapter-4-asteroids-pilot',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    packageVersionId: overrides.packageVersionId ?? 1,
    packageVersion: overrides.packageVersion ?? '0.1.0',
    capabilities: overrides.capabilities ?? [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ],
    snapshotRoot: overrides.snapshotRoot ?? 'var/packages/chapter-4-asteroids/0.1.0',
    entrypointPath:
      overrides.entrypointPath ?? 'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
    contentPath:
      overrides.contentPath ?? 'var/packages/chapter-4-asteroids/0.1.0/content/activity.json',
    services: overrides.services ?? buildLaunchServiceClaims(),
    launch: overrides.launch ?? {
      userRole: 'learner',
      courseId: 'course-42',
      assignmentId: 'assignment-9',
      activityId: 'activity-123',
    },
    ...(overrides.preview === undefined ? {} : { preview: overrides.preview }),
    createdAt: overrides.createdAt ?? TEST_NOW,
    expiresAt: overrides.expiresAt ?? '2026-03-26T22:47:00Z',
  };
}

export function buildDeepLinkingSessionRecord(
  overrides: Partial<DeepLinkingSessionRecord> = {},
): DeepLinkingSessionRecord {
  return {
    sessionId: overrides.sessionId ?? 'deep-linking-session-123',
    sessionToken: overrides.sessionToken ?? 'deep-linking-token-123',
    deploymentRecordId: overrides.deploymentRecordId ?? 1,
    deploymentSlug: overrides.deploymentSlug ?? 'chapter-4-asteroids-pilot',
    appId: overrides.appId ?? 'chapter-4-asteroids',
    userId: overrides.userId ?? 'canvas-user-123',
    userRole: overrides.userRole ?? 'instructor',
    contextId: overrides.contextId ?? 'course-42',
    contextTitle: overrides.contextTitle ?? 'Physics 101',
    deepLinkReturnUrl:
      overrides.deepLinkReturnUrl ?? 'https://canvas.example/courses/42/deep_link_return',
    data: overrides.data ?? 'deep-linking-state-token',
    placement: overrides.placement ?? DEFAULT_ASSIGNMENT_SELECTION_PLACEMENT,
    acceptTypes: overrides.acceptTypes ?? ['ltiResourceLink'],
    acceptMultiple: overrides.acceptMultiple ?? false,
    acceptPresentationDocumentTargets: overrides.acceptPresentationDocumentTargets ?? ['iframe'],
    acceptLineItem: overrides.acceptLineItem ?? false,
    selection: overrides.selection ?? null,
    createdAt: overrides.createdAt ?? TEST_NOW,
    expiresAt: overrides.expiresAt ?? '2026-03-26T22:50:00Z',
  };
}
