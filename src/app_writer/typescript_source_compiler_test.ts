import { assertEquals } from '@std/assert';
import { createTypeScriptAppPackageSourceCompiler } from './typescript_source_compiler.ts';
import type { AppGenerationPlan, AppWriterWorkspaceFile } from './types.ts';

Deno.test('TypeScript source compiler typechecks source files and emits reviewed browser JavaScript', async () => {
  const result = await createTypeScriptAppPackageSourceCompiler().compile({
    generationId: 'generation-1',
    appPlan: buildAppPlan(),
    selectedStarterId: 'simple-activity',
    files: buildTypeScriptWorkspaceFiles(),
  });

  assertEquals(result.validationFindings, []);
  assertEquals(
    result.files.some((file) => file.path === 'source/app.ts'),
    false,
  );
  assertEquals(
    result.files.some((file) => file.path === 'source/content_model.ts'),
    false,
  );
  assertEquals(
    result.files
      .find((file) => file.path === 'dist/app.js')
      ?.contents.includes('getActivityContent'),
    true,
  );
});

Deno.test('TypeScript source compiler reports capability-narrowed SDK diagnostics', async () => {
  const result = await createTypeScriptAppPackageSourceCompiler().compile({
    generationId: 'generation-1',
    appPlan: buildAppPlan(),
    selectedStarterId: 'simple-activity',
    files: buildTypeScriptWorkspaceFiles({
      appSource:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("missing gateway");\n  await gateway.writeLocalState({ done: true });\n}\nvoid start();\n',
    }),
  });

  assertEquals(result.validationFindings[0]?.code, 'typescript_diagnostic');
  assertEquals(result.validationFindings[0]?.file, 'source/app.ts');
});

function buildTypeScriptWorkspaceFiles(
  input: {
    appSource?: string;
  } = {},
): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'source/content_model.ts',
      contents: 'interface ActivityContent {\n  title: string;\n  words: string[];\n}\n',
    },
    {
      path: 'source/app.ts',
      contents: input.appSource ??
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("missing gateway");\n  const content = await gateway.getActivityContent<ActivityContent>();\n  document.body.textContent = content.title;\n  await gateway.emitAttemptEvent({ type: "complete", timestamp: new Date().toISOString() });\n  await gateway.finalizeAttempt({ completionState: "completed" });\n}\nvoid start();\n',
    },
    {
      path: 'manifest.json',
      contents: '{}',
    },
  ];
}

function buildAppPlan(): AppGenerationPlan {
  return {
    appId: 'phonics-match',
    title: 'Phonics Match',
    description: 'A phonics matching activity.',
    learningGoal: 'Practice phonics patterns.',
    audience: 'Grade 1',
    activityType: 'matching',
    learnerFlow: ['Read the word.', 'Choose the match.'],
    contentModel: {
      title: 'string',
      words: 'string[]',
    },
    capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    grading: {
      mode: 'completion',
      maxScore: 100,
      scoringSummary: 'Completion credit.',
    },
    attemptEvents: [
      {
        when: 'on completion',
        eventType: 'complete',
        questionIdPattern: 'activity',
      },
    ],
    previewTests: ['renders title'],
    accessibilityNotes: ['Use readable text.'],
    riskNotes: [],
  };
}
