import { assertEquals, assertRejects } from '@std/assert';
import { createBoundAppWriterWorkspaceHarness } from './workspace_harness_binding.ts';
import type { AppGenerationPlan, AppGenerationPlanningResult } from './types.ts';

Deno.test('bound workspace harness posts whole-workspace planning requests', async () => {
  const requests: Request[] = [];
  const harness = createBoundAppWriterWorkspaceHarness({
    fetch(request) {
      requests.push(request.clone());

      return Promise.resolve(Response.json(buildPlanningResponse()));
    },
  });
  const planning = await harness.plan({
    generationInput: buildGenerationInput(),
    workspace: {
      generationId: 'generation-1',
      selectedStarterId: 'simple-activity',
      files: [
        {
          path: 'AGENTS.md',
          role: 'instruction',
          contents: 'Use Lantern APIs only.\n',
        },
      ],
      generationPlan: [],
      validationFindings: [],
      repairAttemptCount: 0,
      updatedAt: '2026-05-15T12:00:00.000Z',
    },
  });
  const request = requests[0];
  const body = (await request?.json()) as {
    workspace?: { files?: Array<{ path?: unknown; role?: unknown }> };
  };

  assertEquals(new URL(request?.url ?? '').pathname, '/app-writer/workspace-harness/plan');
  assertEquals(body.workspace?.files?.[0]?.path, 'AGENTS.md');
  assertEquals(body.workspace?.files?.[0]?.role, 'instruction');
  assertEquals(planning.appPlan.appId, 'phonics-match');
});

Deno.test('bound workspace harness parses author results with file roles and diagnostics', async () => {
  const harness = createBoundAppWriterWorkspaceHarness({
    fetch(_request) {
      return Promise.resolve(
        Response.json({
          files: [
            {
              path: 'AGENTS.md',
              role: 'instruction',
              contents: 'Use Lantern APIs only.\n',
            },
            {
              path: 'manifest.json',
              role: 'package',
              contents: '{}\n',
            },
          ],
          progressUpdates: [
            {
              stage: 'building_package',
              message: 'Wrote the workspace files.',
            },
          ],
          notes: ['Authored by workspace harness.'],
          validationFindings: [
            {
              code: 'preview_pending',
              severity: 'warning',
              message: 'Preview has not run.',
              file: null,
              field: null,
              fix: null,
              detail: {},
            },
          ],
        }),
      );
    },
  });
  const result = await harness.author({
    generationInput: buildGenerationInput(),
    planning: buildPlanningResponse(),
    workspace: {
      generationId: 'generation-1',
      selectedStarterId: 'simple-activity',
      files: [],
      generationPlan: [],
      validationFindings: [],
      repairAttemptCount: 0,
      updatedAt: '2026-05-15T12:00:00.000Z',
    },
  });

  assertEquals(result.files[0]?.role, 'instruction');
  assertEquals(result.files[1]?.role, 'package');
  assertEquals(result.progressUpdates[0]?.stage, 'building_package');
  assertEquals(result.validationFindings?.[0]?.severity, 'warning');
});

Deno.test('bound workspace harness fails clearly on service errors', async () => {
  const harness = createBoundAppWriterWorkspaceHarness({
    fetch(_request) {
      return Promise.resolve(
        Response.json(
          {
            error: {
              code: 'workspace_harness_failed',
            },
          },
          { status: 503 },
        ),
      );
    },
  });

  await assertRejects(
    () =>
      harness.plan({
        generationInput: buildGenerationInput(),
        workspace: {
          generationId: 'generation-1',
          selectedStarterId: 'simple-activity',
          files: [],
          generationPlan: [],
          validationFindings: [],
          repairAttemptCount: 0,
          updatedAt: '2026-05-15T12:00:00.000Z',
        },
      }),
    Error,
    'workspace harness planning response failed with HTTP 503',
  );
});

function buildGenerationInput() {
  return {
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create phonics flashcards.',
    requestedAppId: 'phonics-match',
    selectedStarterId: 'simple-activity' as const,
    selectedContext: {},
    authoringMode: 'typescript' as const,
    createdAt: '2026-05-15T12:00:00.000Z',
  };
}

function buildPlanningResponse(): AppGenerationPlanningResult {
  return {
    normalizedRequest: {
      learningGoal: 'Practice phonics.',
      audience: 'Grade 1',
      contentSummary: 'Short-a words.',
      requestedActivity: 'flashcards',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: buildPlan(),
    selectedStarterId: 'simple-activity' as const,
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Planning the Lantern workspace app.',
      },
    ],
    notes: ['Planned by workspace harness.'],
  };
}

function buildPlan(): AppGenerationPlan {
  return {
    appId: 'phonics-match',
    title: 'Phonics Match',
    description: 'A phonics flashcard app.',
    learningGoal: 'Practice phonics.',
    audience: 'Grade 1',
    activityType: 'flashcards',
    learnerFlow: ['Open cards.', 'Review each card.'],
    contentModel: {},
    capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    grading: {
      mode: 'completion',
      maxScore: 100,
      scoringSummary: 'Completion credit.',
    },
    attemptEvents: [],
    previewTests: [],
    accessibilityNotes: [],
    riskNotes: [],
  };
}
