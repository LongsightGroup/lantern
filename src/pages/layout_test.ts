import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderLayout } from './layout.ts';

Deno.test('public layout uses the navy accent palette instead of indigo', () => {
  const html = renderLayout('Lantern', '<main>Home</main>');

  assertStringIncludes(html, '--accent: #153a61;');
  assertEquals(html.includes('#4f46e5'), false);
  assertEquals(html.includes('#4338ca'), false);
});
