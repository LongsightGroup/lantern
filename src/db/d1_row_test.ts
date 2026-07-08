import { assertEquals, assertThrows } from '@std/assert';
import {
  expectD1JsonRecord,
  expectD1StringArray,
  parseD1JsonField,
  parseD1NullableJsonField,
} from './d1_row.ts';

Deno.test('D1 row parser rejects non-JSON text fields clearly', () => {
  assertThrows(
    () => parseD1JsonField({ value: true }, 'package_versions.capabilities', expectD1StringArray),
    TypeError,
    'Expected D1 package_versions.capabilities to be JSON text.',
  );
});

Deno.test('D1 row parser rejects malformed JSON column shapes', () => {
  assertThrows(
    () => parseD1JsonField('{"not":"an array"}', 'runtime_sessions.agsScope', expectD1StringArray),
    TypeError,
    'Expected D1 runtime_sessions.agsScope JSON to be a text array.',
  );
});

Deno.test('D1 nullable JSON row parser preserves null and parses records', () => {
  assertEquals(
    parseD1NullableJsonField(null, 'audit_events.detail', expectD1JsonRecord),
    null,
  );
  assertEquals(
    parseD1NullableJsonField('{"code":"ok"}', 'audit_events.detail', expectD1JsonRecord),
    { code: 'ok' },
  );
});
