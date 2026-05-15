import { assertEquals } from '@std/assert';
import { selectAppWriterContext } from './context.ts';
import { APP_WRITER_EVALUATION_PROMPTS } from './evaluation_corpus.ts';

Deno.test('app writer evaluation corpus covers the planned prompt families', () => {
  assertEquals(
    APP_WRITER_EVALUATION_PROMPTS.map((prompt) => prompt.id),
    [
      'phonics-game',
      'flashcards',
      'matching-activity',
      'sorting-activity',
      'short-simulation',
      'browser-autograder-repair',
    ],
  );
});

Deno.test('app writer evaluation corpus matches starter selection expectations', () => {
  for (const prompt of APP_WRITER_EVALUATION_PROMPTS) {
    assertEquals(
      selectAppWriterContext({
        promptText: prompt.promptText,
        requestedAppId: null,
      }).starterId,
      prompt.expectedStarterId,
      prompt.id,
    );
  }
});
