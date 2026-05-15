import { assertEquals } from '@std/assert';
import { formatDateTime } from './layout_support.ts';

Deno.test('formatDateTime renders admin timestamps in the configured admin timezone', () => {
  assertEquals(formatDateTime('2026-05-15T13:55:00.000Z'), 'May 15, 2026, 9:55 AM');
});

Deno.test('formatDateTime keeps null timestamps explicit', () => {
  assertEquals(formatDateTime(null), 'Not recorded yet');
});
