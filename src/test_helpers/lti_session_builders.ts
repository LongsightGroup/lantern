import { resolveSubmissionMode } from '../../sdk/app-sdk.ts';
import type { LTISession } from '@longsightgroup/lti-tool';
import type { LmsType, RuntimeSessionRecord } from '../lti/types.ts';
import { buildLaunchServiceClaims, TEST_NOW } from './lti_identity_builders.ts';

export function buildTestLtiJwtPayload(
  input: {
    targetLinkUri?: string;
  } = {},
): LTISession['jwtPayload'] {
  const targetLinkUri = input.targetLinkUri ?? 'http://localhost:8417/lti/launch';
  const base = {
    iss: 'https://canvas.instructure.com',
    aud: '10000000000001',
    exp: 4_102_444_800,
    iat: 1_735_689_600,
    nonce: 'nonce-123',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deployment-123',
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': targetLinkUri,
  } as const;

  return {
    ...base,
    sub: 'canvas-user-123',
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
  };
}

export function buildRuntimeSessionRecord(
  overrides: Partial<RuntimeSessionRecord> & { servicesLms?: LmsType } = {},
): RuntimeSessionRecord {
  const { servicesLms = 'canvas', ...sessionOverrides } = overrides;

  return {
    sessionId: sessionOverrides.sessionId ?? 'runtime-session-123',
    sessionToken: sessionOverrides.sessionToken ?? 'runtime-token-123',
    ltiToolSessionId: sessionOverrides.ltiToolSessionId ?? null,
    attemptId: sessionOverrides.attemptId ?? 'attempt-123',
    appId: sessionOverrides.appId ?? 'chapter-4-asteroids',
    packageVersionId: sessionOverrides.packageVersionId ?? 1,
    packageVersion: sessionOverrides.packageVersion ?? '0.1.0',
    capabilities: sessionOverrides.capabilities ?? [
      'read_launch_context',
      'read_activity_content',
      'submit_attempt_event',
      'finalize_attempt',
      'read_local_state',
      'write_local_state',
    ],
    snapshotRoot: sessionOverrides.snapshotRoot ?? 'var/packages/chapter-4-asteroids/0.1.0',
    entrypointPath: sessionOverrides.entrypointPath ??
      'var/packages/chapter-4-asteroids/0.1.0/dist/index.html',
    contentPath: sessionOverrides.contentPath ??
      'var/packages/chapter-4-asteroids/0.1.0/content/activity.json',
    services: sessionOverrides.services ??
      buildLaunchServiceClaims({
        lms: servicesLms,
      }),
    launch: sessionOverrides.launch ?? {
      userRole: 'learner',
      courseId: 'course-42',
      assignmentId: 'assignment-9',
      activityId: 'activity-123',
      submissionMode: resolveSubmissionMode(
        sessionOverrides.capabilities ?? [
          'read_launch_context',
          'read_activity_content',
          'submit_attempt_event',
          'finalize_attempt',
          'read_local_state',
          'write_local_state',
        ],
      ),
    },
    preview: sessionOverrides.preview ?? {
      previewSessionId: 'preview-session-123',
    },
    createdAt: sessionOverrides.createdAt ?? TEST_NOW,
    expiresAt: sessionOverrides.expiresAt ?? '2099-03-26T22:47:00Z',
  };
}
