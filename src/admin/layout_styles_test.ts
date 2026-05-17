import { assertEquals, assertStringIncludes } from '@std/assert';
import { ADMIN_LAYOUT_STYLES } from './layout_styles.ts';

Deno.test('admin layout styles apply primary button treatment to link buttons', () => {
  assertStringIncludes(ADMIN_LAYOUT_STYLES, '.button-primary,\n      button.button-primary');
  assertStringIncludes(
    ADMIN_LAYOUT_STYLES,
    '.button-primary:hover,\n      button.button-primary:hover',
  );
});

Deno.test('admin layout styles avoid inset left-edge accent stripes', () => {
  assertEquals(ADMIN_LAYOUT_STYLES.includes('inset 3px 0 0'), false);
});

Deno.test('admin layout styles do not use the old indigo accent palette', () => {
  assertEquals(ADMIN_LAYOUT_STYLES.includes('#4f46e5'), false);
  assertEquals(ADMIN_LAYOUT_STYLES.includes('#4338ca'), false);
});

Deno.test('admin layout styles use vendored Pico and system fonts', () => {
  assertStringIncludes(ADMIN_LAYOUT_STYLES, '--pico-font-family-sans-serif');
  assertStringIncludes(ADMIN_LAYOUT_STYLES, '--pico-font-family: var(--font)');
  assertStringIncludes(
    ADMIN_LAYOUT_STYLES,
    '--font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  );
  assertEquals(ADMIN_LAYOUT_STYLES.includes('DM Sans'), false);
});

Deno.test('admin layout styles let Pico own radio and checkbox control visuals', () => {
  assertEquals(ADMIN_LAYOUT_STYLES.includes('-webkit-appearance: auto;'), false);
  assertEquals(ADMIN_LAYOUT_STYLES.includes('appearance: auto;'), false);
  assertStringIncludes(
    ADMIN_LAYOUT_STYLES,
    'input:not([type="checkbox"], [type="radio"], [type="submit"]',
  );
  assertStringIncludes(ADMIN_LAYOUT_STYLES, '.field .chip-row label');
  assertStringIncludes(ADMIN_LAYOUT_STYLES, '.field .chip-row input[type="radio"]');
});

Deno.test('admin sidebar nav overrides Pico spread alignment', () => {
  assertStringIncludes(ADMIN_LAYOUT_STYLES, '.sidebar-nav {');
  assertStringIncludes(ADMIN_LAYOUT_STYLES, 'justify-content: flex-start;');
  assertStringIncludes(ADMIN_LAYOUT_STYLES, 'align-items: stretch;');
});
