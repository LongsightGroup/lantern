import type { DeploymentRecentLaunch } from '../ops/types.ts';

export function buildDeploymentRecentLaunch(
  overrides: Partial<DeploymentRecentLaunch> = {},
): DeploymentRecentLaunch {
  return {
    occurredAt: overrides.occurredAt ?? '2026-03-24T12:30:00Z',
    summary: overrides.summary ?? 'Accepted the governed LMS launch.',
    attemptId: overrides.attemptId ?? 'attempt-123',
    userId: overrides.userId ?? 'instructor_123',
    userDisplayName: overrides.userDisplayName ?? null,
    userEmail: overrides.userEmail ?? null,
    userLogin: overrides.userLogin ?? null,
    contextId: overrides.contextId ?? 'course-42',
    resourceLinkId: overrides.resourceLinkId ?? 'resource-link-123',
  };
}
