import { assertEquals } from '@std/assert';
import { createAppWriterPlatformServicesHandler } from './platform_services.ts';
import type { AppGenerationPlan, AppWriterWorkspaceFile } from './types.ts';

Deno.test('app writer platform service routes source compilation through the configured compiler', async () => {
  const compileInputs: unknown[] = [];
  const service = createAppWriterPlatformServicesHandler({
    sourceCompiler: {
      supportsTypeScriptAuthoring: true,
      compile(input) {
        compileInputs.push(input);

        return Promise.resolve({
          files: [
            {
              path: 'dist/app.js',
              contents: 'console.log("compiled");\n',
            },
          ],
          validationFindings: [],
          notes: ['compiled'],
        });
      },
    },
  });

  const response = await service.fetch(
    new Request('https://platform.example/app-writer/source-compiler/compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationId: 'generation-1',
        appPlan: buildPlan(),
        selectedStarterId: 'simple-activity',
        files: buildFiles(),
      }),
    }),
  );
  const body = (await response.json()) as {
    files?: Array<{ path?: unknown }>;
    notes?: unknown;
  };

  assertEquals(response.status, 200);
  assertEquals((compileInputs[0] as { generationId?: unknown }).generationId, 'generation-1');
  assertEquals(body.files?.[0]?.path, 'dist/app.js');
  assertEquals(body.notes, ['compiled']);
});

Deno.test('app writer platform service routes preview through the configured previewer', async () => {
  const previewInputs: unknown[] = [];
  const service = createAppWriterPlatformServicesHandler({
    previewer: {
      preview(input) {
        previewInputs.push(input);

        return Promise.resolve({
          validationFindings: [
            {
              code: 'preview_assertion_failed',
              severity: 'error',
              message: 'Expected title was missing.',
              file: 'preview/tests.json',
              field: null,
              fix: 'Render the expected title.',
              detail: {},
            },
          ],
          assertionCount: 1,
          passedAssertionCount: 0,
          runtimeLog: [],
          summary: 'Failed 1/1 preview assertions.',
        });
      },
    },
  });

  const response = await service.fetch(
    new Request('https://platform.example/app-writer/preview/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationId: 'generation-1',
        selectedStarterId: 'simple-activity',
        files: buildFiles(),
      }),
    }),
  );
  const body = (await response.json()) as {
    validationFindings?: Array<{ code?: unknown }>;
    summary?: unknown;
  };

  assertEquals(response.status, 200);
  assertEquals((previewInputs[0] as { generationId?: unknown }).generationId, 'generation-1');
  assertEquals(body.validationFindings?.[0]?.code, 'preview_assertion_failed');
  assertEquals(body.summary, 'Failed 1/1 preview assertions.');
});

Deno.test('app writer platform service fails clearly when an endpoint is not configured', async () => {
  const service = createAppWriterPlatformServicesHandler({});
  const response = await service.fetch(
    new Request('https://platform.example/app-writer/preview/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationId: 'generation-1',
        selectedStarterId: 'simple-activity',
        files: [],
      }),
    }),
  );
  const body = (await response.json()) as {
    error?: { code?: unknown };
  };

  assertEquals(response.status, 503);
  assertEquals(body.error?.code, 'previewer_unavailable');
});

function buildPlan(): AppGenerationPlan {
  return {
    appId: 'phonics-match',
    title: 'Phonics Match',
    description: 'A phonics activity.',
    learningGoal: 'Practice phonics.',
    audience: 'Grade 1',
    activityType: 'flashcards',
    learnerFlow: ['Open the app.', 'Practice cards.'],
    contentModel: {},
    capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    grading: {
      mode: 'completion',
      maxScore: 100,
      scoringSummary: 'Completion credit.',
    },
    attemptEvents: [
      {
        when: 'after each answer',
        eventType: 'answer',
        questionIdPattern: 'card-*',
      },
    ],
    previewTests: ['renders title'],
    accessibilityNotes: ['Use buttons.'],
    riskNotes: [],
  };
}

function buildFiles(): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'source/app.ts',
      contents: 'document.body.textContent = "Phonics Match";\n',
    },
  ];
}
