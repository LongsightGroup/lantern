import { assertEquals } from '@std/assert';
import {
  type AppWriterWorkspaceHarness,
  createHarnessWorkspaceRunner,
} from './workspace_runner.ts';
import type {
  AppGenerationPlanningResult,
  AppGenerationWorkspaceRecord,
  AppPackageGenerationInput,
} from './types.ts';
import { buildAppGenerationWorkspaceRecord } from '../test_helpers/package_review_in_memory_app_generation.ts';

Deno.test('harness workspace runner gives the harness the initialized workspace for planning and authoring', async () => {
  const calls: string[] = [];
  const initializedWorkspace = buildWorkspace();
  const harness: AppWriterWorkspaceHarness = {
    author(input) {
      calls.push(`author:${input.workspace.files[0]?.path}:${input.planning.appPlan.appId}`);

      return Promise.resolve({
        files: input.workspace.files.map((file) =>
          file.path === 'manifest.json'
            ? { ...file, contents: '{"app_id":"phonics-match"}\n' }
            : file,
        ),
        progressUpdates: [
          {
            stage: 'building_package',
            message: 'Edited the prepared Lantern workspace.',
          },
        ],
        notes: ['Authored from whole workspace.'],
      });
    },
    repair(_input) {
      throw new Error('Repair should not run in this test.');
    },
  };
  const runner = createHarnessWorkspaceRunner({ harness });
  const planning = await runner.plan({
    ...buildGenerationInput(),
    initializedWorkspace,
  });
  const authored = await runner.author({
    ...buildGenerationInput(),
    initializedWorkspace,
    planning,
  });

  assertEquals(calls, ['author:AGENTS.md:phonics-match']);
  assertEquals(authored.files[1]?.contents, '{"app_id":"phonics-match"}\n');
  assertEquals(authored.validationFindings, []);
});

Deno.test('harness workspace runner repairs from the persisted workspace snapshot', async () => {
  const workspace = buildWorkspace();
  const harness: AppWriterWorkspaceHarness = {
    author(_input) {
      throw new Error('Author should not run in this test.');
    },
    repair(input) {
      return Promise.resolve({
        files: input.workspace.files.filter((file) => file.path !== 'server/worker.ts'),
        progressUpdates: [
          {
            stage: 'repairing_package',
            message: 'Removed a disallowed file from the workspace.',
          },
        ],
        notes: ['Repaired from workspace snapshot.'],
      });
    },
  };
  const runner = createHarnessWorkspaceRunner({ harness });
  const repaired = await runner.repair({
    ...buildGenerationInput(),
    repairAttempt: 1,
    previousResult: {
      ...buildPlanning(),
      files: [
        ...workspace.files,
        {
          path: 'server/worker.ts',
          contents: 'export default {};\n',
          role: 'package',
        },
      ],
      validationFindings: [],
    },
    validationFindings: [
      {
        code: 'file_path_not_allowed',
        severity: 'error',
        message: 'server/worker.ts is not allowed.',
        file: 'server/worker.ts',
        field: null,
        fix: 'Remove the file.',
        detail: {},
      },
    ],
    currentWorkspace: {
      ...workspace,
      files: [
        ...workspace.files,
        {
          path: 'server/worker.ts',
          contents: 'export default {};\n',
          role: 'package',
        },
      ],
    },
  });

  assertEquals(
    repaired.files.some((file) => file.path === 'server/worker.ts'),
    false,
  );
  assertEquals(repaired.notes.includes('Repaired from workspace snapshot.'), true);
});

function buildWorkspace(): AppGenerationWorkspaceRecord {
  return buildAppGenerationWorkspaceRecord({
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
  });
}

function buildGenerationInput(): AppPackageGenerationInput {
  return {
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create phonics flashcards.',
    requestedAppId: 'phonics-match',
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    authoringMode: 'typescript',
    createdAt: '2026-05-15T12:00:00.000Z',
  };
}

function buildPlanning(): AppGenerationPlanningResult {
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
    appPlan: {
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
    },
    selectedStarterId: 'simple-activity',
    progressUpdates: [],
    notes: ['Planned by harness.'],
  };
}
