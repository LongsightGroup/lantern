import { assertEquals } from '@std/assert';
import { requireTestDatabaseUrl } from '../test_helpers/postgres.ts';
import { Pool } from './postgres.ts';

Deno.test('postgres adapter preserves native row shapes for arrays, json, and text', async () => {
  const pool = new Pool(requireTestDatabaseUrl(), 1, true);
  const client = await pool.connect();

  try {
    const result = await client.queryObject<{
      emptyTextArray: unknown;
      filledTextArray: unknown;
      jsonObject: unknown;
      jsonArray: unknown;
      textArrayLiteral: unknown;
      textObjectLiteral: unknown;
      snakeCaseValue: unknown;
    }>({
      text: "select '{}'::text[] as empty_text_array, '{alpha,beta}'::text[] as filled_text_array, '{\"ok\":true}'::jsonb as json_object, '[1,2]'::jsonb as json_array, '[]'::text as text_array_literal, '{}'::text as text_object_literal, 7 as snake_case_value",
      camelCase: true,
    });

    assertEquals(result.rows[0], {
      emptyTextArray: [],
      filledTextArray: ['alpha', 'beta'],
      jsonObject: { ok: true },
      jsonArray: [1, 2],
      textArrayLiteral: '[]',
      textObjectLiteral: '{}',
      snakeCaseValue: 7,
    });
  } finally {
    client.release();
    await pool.end();
  }
});

Deno.test('postgres adapter returns array-mode rows for queryArray', async () => {
  const pool = new Pool(requireTestDatabaseUrl(), 1, true);
  const client = await pool.connect();

  try {
    const result = await client.queryArray('select 1 as left_value, 2 as right_value');

    assertEquals(result.rows, [[1, 2]]);
  } finally {
    client.release();
    await pool.end();
  }
});

Deno.test('postgres adapter normalizes JSON-string parameters for ::jsonb casts', async () => {
  const pool = new Pool(requireTestDatabaseUrl(), 1, true);
  const client = await pool.connect();

  try {
    const result = await client.queryObject<{ payload: unknown }>({
      text: 'select $1::jsonb as payload',
      args: [JSON.stringify({ ok: true, count: 2 })],
      camelCase: true,
    });

    assertEquals(result.rows[0], {
      payload: { ok: true, count: 2 },
    });
  } finally {
    client.release();
    await pool.end();
  }
});
