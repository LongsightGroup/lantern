import { assertEquals } from '@std/assert';
import { hasStylesheetLink } from './html_inspection.ts';

Deno.test('hasStylesheetLink accepts href and rel attributes in either order', () => {
  assertEquals(
    hasStylesheetLink('<link href="./app.css" rel="stylesheet">', './app.css'),
    true,
  );
  assertEquals(
    hasStylesheetLink('<link rel="stylesheet" href="./app.css">', './app.css'),
    true,
  );
});

Deno.test('hasStylesheetLink accepts links without an explicit dot slash', () => {
  assertEquals(
    hasStylesheetLink('<link href="app.css" rel="stylesheet">', './app.css'),
    true,
  );
});
