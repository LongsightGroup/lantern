import { test } from 'vite-plus/test';
import { assertEquals, assertThrows } from '@std/assert';
import { workflowCheckpoint } from './workflow_checkpoint.ts';

test('workflow checkpoints preserve JSON records across structured cloning', () => {
  const record = {
    ok: true,
    value: { files: [{ path: 'app.ts', contents: 'code' }], optional: undefined, plan: null },
  };
  assertEquals(structuredClone(workflowCheckpoint(record)), record);
});

test('workflow checkpoints reject values that cannot be stored as JSON records', () => {
  for (const value of [() => {}, Symbol('unsupported'), new Map(), new Date(), Number.NaN]) {
    assertThrows(() => workflowCheckpoint({ nested: [value] }), Error, 'plain JSON data');
  }
});
