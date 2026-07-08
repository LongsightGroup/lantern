import { assertEquals, assertRejects } from '@std/assert';
import {
  buildAttemptRecord,
  buildControlPlaneDiagnosticItem,
  buildDeploymentRecord,
  buildGradePublicationRecord,
  buildLineItemBindingRecord,
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from '../test_helpers/package_review.ts';
import {
  buildDeploymentBinding,
  buildLaunchServiceClaims,
  buildRuntimeSessionRecord,
} from '../test_helpers/lti.ts';
import { createTestLtiToolContext } from '../test_helpers/lti_tool_context.ts';
import { formatDiagnosticItem, retryFailedGradePublication } from './service.ts';
import { publishRuntimeAttemptScore } from '../runtime/gateway_publication.ts';

Deno.test('ops service retries failed grade publication through the verified lti-tool session', async () => {
  const ltiToolContext = createTestLtiToolContext({
    sessionId: 'lti-tool-session-123',
  });
  const repository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 1,
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 1,
        attemptId: 'attempt-123',
        status: 'completed',
        completionState: 'completed',
        finalizedAt: '2026-03-24T12:31:00Z',
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: 'attempt-123',
        status: 'failed',
        gradingProgress: 'Failed',
        publishedAt: null,
        updatedAt: '2026-03-24T12:35:00Z',
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        ltiToolSessionId: 'lti-tool-session-123',
        sessionId: 'runtime-session-123',
        attemptId: 'attempt-123',
        createdAt: '2026-03-24T12:30:00Z',
        expiresAt: '2026-03-25T12:30:00Z',
      }),
    ],
  });

  const result = await retryFailedGradePublication({
    repository,
    attemptId: 'attempt-123',
    getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
    now: () => new Date('2026-03-24T12:45:00Z'),
  });
  const savedPublication = await repository.getGradePublicationByAttemptId('attempt-123');

  assertEquals(ltiToolContext.submittedScores.length, 1);
  assertEquals(result.attemptId, 'attempt-123');
  assertEquals(result.publication.status, 'published');
  assertEquals(savedPublication?.id, 1);
  assertEquals(savedPublication?.status, 'published');
  assertEquals(savedPublication?.publishedAt, '2026-03-24T12:45:00.000Z');
});

Deno.test('ops service blocks retry when no failed publication or AGS context remains for the attempt', async () => {
  const missingPublicationRepository = createInMemoryPackageReviewRepository({
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: 'attempt-123',
        status: 'published',
        publishedAt: '2026-03-24T12:35:00Z',
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        ltiToolSessionId: 'lti-tool-session-123',
        attemptId: 'attempt-123',
        expiresAt: '2026-03-25T12:30:00Z',
      }),
    ],
  });
  const missingAgsRepository = createInMemoryPackageReviewRepository({
    deployments: [
      buildDeploymentRecord({
        id: 1,
        binding: buildDeploymentBinding(),
      }),
    ],
    attempts: [
      buildAttemptRecord({
        id: 2,
        attemptId: 'attempt-456',
      }),
    ],
    gradePublications: [
      buildGradePublicationRecord({
        attemptId: 'attempt-456',
        status: 'failed',
        publishedAt: null,
      }),
    ],
    runtimeSessions: [
      buildRuntimeSessionRecord({
        ltiToolSessionId: 'lti-tool-session-123',
        attemptId: 'attempt-456',
        services: buildLaunchServiceClaims({
          ags: null,
        }),
      }),
    ],
  });
  const ltiToolContext = createTestLtiToolContext();

  await assertRejects(
    () =>
      retryFailedGradePublication({
        repository: missingPublicationRepository,
        attemptId: 'attempt-123',
        getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
      }),
    Error,
    'could not find a failed grade publication',
  );

  await assertRejects(
    () =>
      retryFailedGradePublication({
        repository: missingAgsRepository,
        attemptId: 'attempt-456',
        getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
      }),
    Error,
    'does not include AGS service context',
  );
});

Deno.test('ops service formats governed runtime failures with runtime-specific operator summaries', () => {
  const capabilityDenied = formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: 'runtime',
      eventType: 'runtime.capability.denied',
      code: 'capability_not_granted',
      boundaryDenialCategory: 'policyDenied',
      summary: 'Denied reviewed app capability write_local_state.',
      detail: {
        capability: 'write_local_state',
        category: 'policyDenied',
        sandboxModel: 'contained_browser_runtime',
        boundary: 'app_runtime_origin',
      },
    }),
  );
  const timeout = formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: 'runtime',
      eventType: 'runtime.session.timeout',
      code: 'session_expired',
      summary: 'Runtime session expired before the reviewed app could continue.',
      detail: {
        sandboxModel: 'contained_browser_runtime',
        boundary: 'app_runtime_origin',
      },
    }),
  );
  const integrityFailure = formatDiagnosticItem(
    buildControlPlaneDiagnosticItem({
      kind: 'runtime',
      eventType: 'runtime.session.integrity_failed',
      code: 'package_version_missing',
      summary: 'Reviewed runtime integrity checks blocked this session.',
      detail: {
        sandboxModel: 'contained_browser_runtime',
        boundary: 'app_runtime_origin',
      },
    }),
  );

  assertEquals(
    capabilityDenied.operatorSummary,
    'Lantern denied reviewed app capability write_local_state at the governed runtime boundary.',
  );
  assertEquals(
    timeout.operatorSummary,
    'Runtime session timed out before the reviewed app could continue.',
  );
  assertEquals(
    integrityFailure.operatorSummary,
    'Reviewed runtime integrity checks blocked this session before app code could continue.',
  );
});

Deno.test('runtime publication uses lti-tool to publish final scores', async () => {
  const ltiToolContext = createTestLtiToolContext({
    sessionId: 'lti-tool-session-123',
  });
  const deployment = buildDeploymentRecord({
    id: 1,
    enabledPackageVersionId: 1,
    enabledPackageVersion: '0.1.0',
    binding: buildDeploymentBinding(),
  });
  const attempt = buildAttemptRecord({
    id: 1,
    attemptId: 'attempt-123',
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    status: 'completed',
    completionState: 'completed',
    finalizedAt: '2026-03-24T12:31:00Z',
  });
  const session = buildRuntimeSessionRecord({
    ltiToolSessionId: 'lti-tool-session-123',
    attemptId: attempt.attemptId,
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    packageVersion: '0.1.0',
  });
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: 'approved',
    reviewedAt: '2026-03-23T18:05:00Z',
  });
  const repository = createInMemoryPackageReviewRepository({
    deployments: [deployment],
    attempts: [attempt],
    runtimeSessions: [session],
    packageVersions: [packageVersion],
    lineItemBindings: [
      buildLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: packageVersion.id,
        contextId: attempt.contextId,
        resourceLinkId: attempt.resourceLinkId,
        activityId: attempt.activityId,
      }),
    ],
  });

  const result = await publishRuntimeAttemptScore({
    repository,
    session,
    attempt,
    packageVersion,
    score: {
      scoreGiven: 85,
      scoreMaximum: 100,
    },
    getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
    now: () => new Date('2026-03-24T12:45:00Z'),
  });

  assertEquals(result.gradePublishedNow, true);
  assertEquals(result.publishError, null);
  assertEquals(result.gradePublication?.status, 'published');
  assertEquals(ltiToolContext.submittedScores.length, 1);
});

Deno.test('runtime publication records lti-tool score publish failures', async () => {
  const ltiToolContext = createTestLtiToolContext({
    sessionId: 'lti-tool-session-123',
    submitScoreSuccess: false,
    submitScoreMessage: 'score publish failed',
  });
  const deployment = buildDeploymentRecord({
    id: 1,
    enabledPackageVersionId: 1,
    enabledPackageVersion: '0.1.0',
    binding: buildDeploymentBinding(),
  });
  const attempt = buildAttemptRecord({
    id: 1,
    attemptId: 'attempt-123',
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    status: 'completed',
    completionState: 'completed',
    finalizedAt: '2026-03-24T12:31:00Z',
  });
  const session = buildRuntimeSessionRecord({
    ltiToolSessionId: 'lti-tool-session-123',
    attemptId: attempt.attemptId,
    deploymentRecordId: deployment.id,
    deploymentSlug: deployment.slug,
    packageVersionId: 1,
    packageVersion: '0.1.0',
  });
  const packageVersion = buildPackageVersionRecord({
    id: 1,
    approvalStatus: 'approved',
    reviewedAt: '2026-03-23T18:05:00Z',
  });
  const repository = createInMemoryPackageReviewRepository({
    deployments: [deployment],
    attempts: [attempt],
    runtimeSessions: [session],
    packageVersions: [packageVersion],
    lineItemBindings: [
      buildLineItemBindingRecord({
        deploymentRecordId: deployment.id,
        packageVersionId: packageVersion.id,
        contextId: attempt.contextId,
        resourceLinkId: attempt.resourceLinkId,
        activityId: attempt.activityId,
      }),
    ],
  });

  const result = await publishRuntimeAttemptScore({
    repository,
    session,
    attempt,
    packageVersion,
    score: {
      scoreGiven: 85,
      scoreMaximum: 100,
    },
    getLtiToolContext: () => Promise.resolve(ltiToolContext.context),
    now: () => new Date('2026-03-24T12:45:00Z'),
  });

  assertEquals(result.gradePublishedNow, false);
  assertEquals(result.publishError?.code, 'score_publish_failed');
  assertEquals(result.publishError?.message, 'score publish failed');
  assertEquals(result.gradePublication?.status, 'failed');
});
