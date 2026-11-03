import { test } from 'vite-plus/test';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { validateManifest } from '../package_review/manifest.ts';
import { createPythonLabPackageSource } from './package_source.ts';

test('Python Lab package contains only public assignment content and a sandbox grading contract', async () => {
  const source = createPythonLabPackageSource({
    labId: 'lab-123',
    content: {
      title: 'Add numbers',
      prompt: 'Return the sum.',
      starterCode: 'def add(left, right):\n    return 0\n',
      functionName: 'add',
      publicCases: [
        { label: 'one plus two', args: [1, 2], expected: 3 },
        { label: 'zero plus four', args: [0, 4], expected: 4 },
        { label: 'negative plus five', args: [-1, 5], expected: 4 },
      ],
      scoreMaximum: 10,
    },
  });
  const validation = await validateManifest(source);
  const content = await source.readText('content/activity.json');

  assertEquals(validation.ok, true);
  if (!validation.ok) {
    throw new Error(JSON.stringify(validation.issues));
  }
  assertEquals(validation.reviewData.grading, {
    mode: 'sandbox',
    rubricFile: null,
    maxScore: 10,
  });
  assertEquals(validation.reviewData.capabilities, [
    'read_launch_context',
    'read_activity_content',
    'run_code_submission',
  ]);
  assertStringIncludes(content ?? '', 'publicCases');
  assertEquals((content ?? '').includes('hidden'), false);
  assertEquals((content ?? '').includes('referenceCode'), false);
});
