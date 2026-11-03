import { test } from 'vite-plus/test';
import { assertEquals, assertThrows } from '@std/assert';
import {
  parseGeneratedCodeTestInputs,
  parsePythonAssignmentDraft,
  PythonContractError,
} from './contract.ts';

test('Python contract accepts only a named function draft and JSON test vectors', () => {
  const draft = parsePythonAssignmentDraft({
    title: 'Add numbers',
    prompt: 'Write a function that returns the sum of two integers.',
    starterCode: 'def add(left, right):\n    pass\n',
    referenceCode: 'def add(left, right):\n    return left + right\n',
    functionName: 'add',
  });
  const cases = parseGeneratedCodeTestInputs({
    cases: [
      { label: 'small positives', visibility: 'public', args: [1, 2] },
      { label: 'zero', visibility: 'public', args: [0, 4] },
      { label: 'negative', visibility: 'public', args: [-1, 5] },
      { label: 'large', visibility: 'hidden', args: [500, 700] },
      { label: 'both negative', visibility: 'hidden', args: [-2, -3] },
      { label: 'mixed', visibility: 'hidden', args: [-3, 9] },
      { label: 'identity', visibility: 'hidden', args: [0, 0] },
      { label: 'boundary', visibility: 'hidden', args: [999, 1] },
    ],
  });

  assertEquals(draft.contract, { functionName: 'add', maxScore: 10 });
  assertEquals(cases.length, 8);
});

test('Python contract rejects wrong case counts and non JSON values', () => {
  assertThrows(
    () => parseGeneratedCodeTestInputs({ cases: [] }),
    PythonContractError,
    'exactly 8 cases',
  );
  assertThrows(
    () =>
      parseGeneratedCodeTestInputs({
        cases: Array.from({ length: 8 }, (_, index) => ({
          label: `case ${index}`,
          visibility: index < 3 ? 'public' : 'hidden',
          args: [Number.NaN],
        })),
      }),
    PythonContractError,
    'JSON-compatible',
  );
});
