import { assertEquals } from '@std/assert';
import { mapRuntimeSessionRow } from './repository_mappers_sessions.ts';
import type { RuntimeSessionRow } from './repository_row_types.ts';

Deno.test('runtime session mapper preserves preview session markers for review launches', () => {
  const session = mapRuntimeSessionRow(
    buildRuntimeSessionRow({
      previewSessionId: 'preview-session-123',
    }),
  );

  assertEquals(session.preview, { previewSessionId: 'preview-session-123' });
});

function buildRuntimeSessionRow(overrides: Partial<RuntimeSessionRow> = {}): RuntimeSessionRow {
  return {
    sessionId: 'runtime-session-123',
    sessionToken: 'runtime-token-123',
    attemptId: 'attempt-123',
    deploymentRecordId: 1,
    deploymentSlug: 'flashcard-practice-preview',
    appId: 'flashcard-practice',
    packageVersionId: 2,
    packageVersion: '0.2.0',
    capabilities: ['read_launch_context', 'read_activity_content', 'finalize_attempt'],
    snapshotRoot: 'var/packages/flashcard-practice/0.2.0',
    entrypointPath: 'var/packages/flashcard-practice/0.2.0/dist/index.html',
    contentPath: 'var/packages/flashcard-practice/0.2.0/content/activity.json',
    agsScope: [],
    agsLineitemsUrl: null,
    agsLineitemUrl: null,
    nrpsContextMembershipsUrl: null,
    nrpsServiceVersions: [],
    launchUserRole: 'learner',
    launchCourseId: 'course_demo',
    launchAssignmentId: 'assignment_demo',
    launchActivityId: 'flashcard-practice',
    previewSessionId: null,
    createdAt: '2026-05-16T14:00:00.000Z',
    expiresAt: '2026-05-16T14:10:00.000Z',
    ...overrides,
  };
}
