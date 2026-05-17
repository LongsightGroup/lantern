import { assertEquals, assertThrows } from '@std/assert';
import {
  assertSmokeRunHtml,
  parseAppWriterSmokeArgs,
  selectSmokePrompts,
} from './app_writer_smoke.ts';

Deno.test('app writer smoke runner selects the production prompt set', () => {
  const options = parseAppWriterSmokeArgs([
    '--origin=https://lantern.example',
    '--production-set=1',
    '--timeout-ms=1000',
    '--poll-ms=100',
  ]);

  assertEquals(options.origin, 'https://lantern.example');
  assertEquals(options.promptIds, [
    'phonics-flashcards-progress-report',
    'fractions-adaptive-practice',
    'browser-autograder-repair',
  ]);
  assertEquals(options.timeoutMs, 1000);
  assertEquals(options.pollMs, 100);
});

Deno.test('app writer smoke runner rejects unknown prompt ids', () => {
  assertThrows(
    () => selectSmokePrompts(['unknown-prompt']),
    Error,
    'Unknown app writer smoke prompt id',
  );
});

Deno.test('app writer smoke runner asserts the full proof loop page evidence', () => {
  assertSmokeRunHtml(`
    <h2>saved pending version</h2>
    <article>initialize workspace <span>succeeded</span></article>
    <article>typecheck source <span>succeeded</span></article>
    <article>validate package <span>succeeded</span></article>
    <article>preview runtime <span>succeeded</span></article>
    <article>save pending version <span>succeeded</span></article>
    <section>Generated files</section>
    <section>Preview summary</section>
    <section>Activity</section>
    <p>Saved generated package as a pending package version.</p>
  `);
});
