import { assert, assertEquals } from '@std/assert';
import { selectAppWriterContext } from './context.ts';

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
  assert(
    excerpts.every(
      (excerpt) => !excerpt.source.includes('private/') && !excerpt.content.includes('private/'),
    ),
  );
});
