import { assert, assertEquals } from '@std/assert';
import { selectAppWriterContext } from './context.ts';
import { APP_WRITER_RECIPE_ID, APP_WRITER_RECIPE_VERSION } from './recipe.ts';

Deno.test('app writer context selector chooses browser autograder references for checked web work', () => {
  const selection = selectAppWriterContext({
    promptText: 'Create an autograder that checks HTML and CSS evidence.',
    requestedAppId: null,
  });

  assertEquals(selection.starterId, 'browser-autograder');
  assertEquals(selection.selectedContext.referenceAppIds, [
    'template',
    'web-checkup',
    'typescript-ladder-game',
  ]);
  assert(
    selection.selectedContext.promptContextExcerpts.some(
      (excerpt) => excerpt.id === 'browser-autograder-starter',
    ),
  );
});

Deno.test('app writer context selector keeps generic activities on the simple starter', () => {
  const selection = selectAppWriterContext({
    promptText: 'Create a phonics matching game for 100 words.',
    requestedAppId: 'phonics-match',
  });

  assertEquals(selection.starterId, 'simple-activity');
  assertEquals(selection.selectedContext.referenceAppIds, [
    'chapter-4-asteroids',
    'examples/starters/simple-activity',
  ]);
});

Deno.test('app writer context selector includes prompt-safe state and reporting guidance', () => {
  const selection = selectAppWriterContext({
    promptText:
      'Create phonics flashcards that track usage by each student and produce an instructor progress report.',
    requestedAppId: 'phonics-flashcards',
  });

  const excerpts = selection.selectedContext.promptContextExcerpts;

  assert(excerpts.some((excerpt) => excerpt.id === 'state-progress-reporting'));
  assert(excerpts.some((excerpt) => excerpt.content.includes('writeLocalState()')));
  assert(excerpts.some((excerpt) => excerpt.content.includes('emitAttemptEvent()')));
  assert(excerpts.some((excerpt) => excerpt.content.includes('complete events use only type')));
  assert(
    excerpts.every(
      (excerpt) => !excerpt.source.includes('private/') && !excerpt.content.includes('private/'),
    ),
  );
});

Deno.test('app writer context selector records TypeScript authoring mode', () => {
  const selection = selectAppWriterContext({
    promptText: 'Create a phonics matching game for 100 words.',
    requestedAppId: 'phonics-match',
    authoringMode: 'typescript',
  });

  assertEquals(selection.selectedContext.authoringMode, 'typescript');
  assertEquals(selection.selectedContext.recipe.recipeId, APP_WRITER_RECIPE_ID);
  assertEquals(selection.selectedContext.recipe.recipeVersion, APP_WRITER_RECIPE_VERSION);
  assertEquals(selection.selectedContext.recipe.authoringMode, 'typescript');
  assertEquals(selection.selectedContext.recipe.maxRepairAttempts, 4);
  assert(
    selection.selectedContext.promptContextExcerpts.some((excerpt) =>
      excerpt.content.includes('source/app.ts')
    ),
  );
});

Deno.test('app writer context selector records the versioned app writer recipe', () => {
  const selection = selectAppWriterContext({
    promptText: 'Create a short matching practice app.',
    requestedAppId: 'matching-practice',
    maxRepairAttempts: 2,
  });

  assertEquals(selection.selectedContext.recipe.recipeId, APP_WRITER_RECIPE_ID);
  assertEquals(selection.selectedContext.recipe.recipeVersion, APP_WRITER_RECIPE_VERSION);
  assertEquals(selection.selectedContext.recipe.outputContracts, [
    'lantern_owned_plan',
    'shell_workspace_snapshot',
    'codemode_workspace_edit',
  ]);
  assertEquals(selection.selectedContext.recipe.proofChecks, [
    'strict_typescript',
    'package_validation',
    'preview_runtime_assertions',
    'policy_checks',
    'style_contract',
  ]);
  assertEquals(selection.selectedContext.recipe.runtimeApi, 'window.GatewayApp');
  assertEquals(selection.selectedContext.recipe.maxRepairAttempts, 2);
});
