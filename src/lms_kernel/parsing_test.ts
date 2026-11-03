import { test } from 'vite-plus/test';
import { assertEquals } from '@std/assert';
import { parseRosterListInput } from './parsing.ts';

test('roster input parser returns a narrowed immutable command', () => {
  assertEquals(parseRosterListInput({ fields: ['photo', 'email', 'photo'], cursor: 'next' }), {
    ok: true,
    value: {
      fields: ['photo', 'email'],
      cursor: 'next',
    },
  });
});

test('roster input parser rejects unknown fields, keys, and malformed cursors', () => {
  assertEquals(parseRosterListInput({ fields: ['pronouns'] }), { ok: false });
  assertEquals(parseRosterListInput({ fields: [], pageSize: 100 }), { ok: false });
  assertEquals(parseRosterListInput({ fields: [], cursor: '' }), { ok: false });
});
