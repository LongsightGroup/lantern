import { assertEquals } from '@std/assert';
import { selectAppWriterContext } from './context.ts';
import { buildInitializedAppWriterWorkspace } from './workspace_initialization.ts';

Deno.test('app writer workspace initialization includes instructions, SDK, DoD, generated-app, design, and validation contracts', () => {
  const contextSelection = selectAppWriterContext({
    promptText: 'Create a phonics flashcard app with student progress.',
    requestedAppId: 'phonics-flashcards',
    authoringMode: 'typescript',
  });
  const workspace = buildInitializedAppWriterWorkspace({
    generationId: 'generation-1',
    contextSelection,
    initializedAt: '2026-05-16T12:00:00.000Z',
  });
  const files = new Map(workspace.files.map((file) => [file.path, file]));

  assertEquals(files.get('AGENTS.md')?.role, 'instruction');
  assertEquals(files.get('.lantern/contracts/generated-app-contract.md')?.role, 'contract');
  assertEquals(files.get('.lantern/contracts/gateway-app-sdk.d.ts')?.role, 'contract');
  assertEquals(files.get('.lantern/contracts/definition-of-done.md')?.role, 'contract');
  assertEquals(files.get('.lantern/contracts/validation-contract.md')?.role, 'contract');
  assertEquals(files.get('.lantern/contracts/style-contract.md')?.role, 'contract');
  assertEquals(files.get('.lantern/contracts/design-contract.md')?.role, 'contract');
  assertEquals(
    files
      .get('.lantern/contracts/generated-app-contract.md')
      ?.contents.includes('lantern-generated-app-contract@0.1.0'),
    true,
  );
  assertEquals(
    files
      .get('.lantern/contracts/design-contract.md')
      ?.contents.includes('Choose the smallest frame that matches the instructor prompt'),
    true,
  );
  assertEquals(files.get('dist/pico.min.css')?.role, 'package');
  assertEquals(files.get('dist/lantern-app.css')?.role, 'package');
  assertEquals(files.get('dist/app.css')?.role, 'package');
  assertEquals(files.get('source/app.ts')?.role, 'evidence');
  assertEquals(
    files
      .get('source/app.ts')
      ?.contents.includes('finalizeAttempt({ completionState: "completed" })'),
    true,
  );
  assertEquals(
    files
      .get('.lantern/contracts/gateway-app-sdk.d.ts')
      ?.contents.includes('NormalizedAttemptEvent'),
    true,
  );
  assertEquals(
    files.get('AGENTS.md')?.contents.includes('Do not call SCORM, xAPI, cmi5, LRS'),
    true,
  );
});
