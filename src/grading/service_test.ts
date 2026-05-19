import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import {
  buildAttemptEventRecord,
  buildAttemptRecord,
  buildPackageVersionRecord,
} from '../test_helpers/package_review.ts';
import { getDefaultRuntimeArtifactStore } from '../runtime/artifact_store_fs.ts';
import type { ReviewedRubric } from './service.ts';

const EXAMPLE_SNAPSHOT_ROOT = 'examples/apps/chapter-4-asteroids';
const artifactStore = getDefaultRuntimeArtifactStore();

Deno.test('loadReviewedRubric loads the reviewed rubric from the pinned snapshot', async () => {
  const grading = await import(`./${'service.ts'}`);
  const packageVersion = buildPackageVersionRecord({
    artifact: {
      snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
      manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
      entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
      digest: 'sha256:example-snapshot',
    },
  });

  const rubric = await grading.loadReviewedRubric({
    snapshotRoot: packageVersion.artifact.snapshotRoot,
    rubricFile: packageVersion.grading.rubricFile,
    artifactStore,
  });

  assertEquals(
    rubric,
    {
      mode: 'per-answer',
      maxScore: 100,
      rules: [
        {
          questionId: 'q1',
          correctAnswer: 'resistance to a change in motion',
          points: 50,
        },
        {
          questionId: 'q2',
          correctAnswer: 'speed with direction',
          points: 50,
        },
      ],
    } satisfies ReviewedRubric,
  );
});

Deno.test('loadReviewedRubric rejects malformed or unsupported rubric JSON at the trusted boundary', async () => {
  const grading = await import(`./${'service.ts'}`);
  const snapshotRoot = await createSnapshotWithRubric({
    mode: 'weighted',
    max_score: 100,
    rules: [
      {
        question_id: 'q1',
        correct_answer: 'resistance to a change in motion',
        points: 100,
      },
    ],
  });

  try {
    await assertRejects(
      () =>
        grading.loadReviewedRubric({
          snapshotRoot,
          rubricFile: '/scoring/rubric.json',
          artifactStore,
        }),
      Error,
      'Only rubric mode "per-answer" is supported.',
    );
  } finally {
    await Deno.remove(snapshotRoot, { recursive: true });
  }
});

Deno.test('scoreAttempt computes the authoritative final declarative score from durable attempt events', async () => {
  const grading = await import(`./${'service.ts'}`);
  const rubric = await grading.loadReviewedRubric({
    snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
    rubricFile: '/scoring/rubric.json',
    artifactStore,
  });
  const packageVersion = buildPackageVersionRecord({
    artifact: {
      snapshotRoot: EXAMPLE_SNAPSHOT_ROOT,
      manifestPath: `${EXAMPLE_SNAPSHOT_ROOT}/manifest.json`,
      entrypointPath: `${EXAMPLE_SNAPSHOT_ROOT}/dist/index.html`,
      digest: 'sha256:example-snapshot',
    },
  });
  const result = grading.scoreAttempt({
    attempt: buildAttemptRecord(),
    grading: packageVersion.grading,
    rubric,
    events: [
      buildAttemptEventRecord({
        id: 1,
        sequence: 1,
        event: {
          type: 'answer',
          questionId: 'q1',
          answer: 'stored heat in an object',
          timestamp: '2026-03-24T02:30:00Z',
        },
      }),
      buildAttemptEventRecord({
        id: 2,
        sequence: 2,
        event: {
          type: 'answer',
          questionId: 'q1',
          answer: 'resistance to a change in motion',
          timestamp: '2026-03-24T02:31:00Z',
        },
      }),
      buildAttemptEventRecord({
        id: 3,
        sequence: 3,
        event: {
          type: 'answer',
          questionId: 'q2',
          answer: 'speed with direction',
          timestamp: '2026-03-24T02:32:00Z',
        },
      }),
      buildAttemptEventRecord({
        id: 4,
        sequence: 4,
        eventType: 'progress',
        event: {
          type: 'progress',
          checkpoint: 'wave-2',
          value: 0.75,
          timestamp: '2026-03-24T02:33:00Z',
        },
      }),
      buildAttemptEventRecord({
        id: 5,
        sequence: 5,
        eventType: 'complete',
        event: {
          type: 'complete',
          timestamp: '2026-03-24T02:34:00Z',
        },
      }),
    ],
  });

  assertEquals(result, {
    scoreGiven: 100,
    scoreMaximum: 100,
  });
});

Deno.test('scoreAttempt computes completion grading from the finalized attempt state', async () => {
  const grading = await import(`./${'service.ts'}`);
  const result = grading.scoreAttempt({
    attempt: buildAttemptRecord({
      completionState: 'completed',
    }),
    grading: {
      mode: 'completion',
      rubricFile: null,
      maxScore: 20,
    },
    events: [],
  });

  assertEquals(result, {
    scoreGiven: 20,
    scoreMaximum: 20,
  });
});

Deno.test('scoreAttempt fails clearly for unsupported or malformed grading inputs', async () => {
  const grading = await import(`./${'service.ts'}`);

  assertThrows(
    () =>
      grading.scoreAttempt({
        attempt: buildAttemptRecord(),
        grading: {
          mode: 'manual',
          rubricFile: null,
          maxScore: null,
        },
        events: [],
      }),
    Error,
    'Manual grading cannot be finalized automatically in Phase 3.',
  );

  const declarativeRubric: ReviewedRubric = {
    mode: 'per-answer',
    maxScore: 100,
    rules: [
      {
        questionId: 'q1',
        correctAnswer: 'resistance to a change in motion',
        points: 100,
      },
    ],
  };

  assertThrows(
    () =>
      grading.scoreAttempt({
        attempt: buildAttemptRecord(),
        grading: {
          mode: 'declarative',
          rubricFile: '/scoring/rubric.json',
          maxScore: 100,
        },
        rubric: declarativeRubric,
        events: [
          buildAttemptEventRecord({
            event: JSON.parse(
              '{"type":"answer","answer":"asteroid","timestamp":"2026-03-24T02:30:00Z"}',
            ) as unknown as ReturnType<typeof buildAttemptEventRecord>['event'],
          }),
        ],
      }),
    Error,
    'questionId',
  );

  assertThrows(
    () =>
      grading.scoreAttempt({
        attempt: buildAttemptRecord({
          completionState: null,
        }),
        grading: {
          mode: 'completion',
          rubricFile: null,
          maxScore: 20,
        },
        events: [],
      }),
    Error,
    'Completion grading requires a finalized completion state.',
  );
});

async function createSnapshotWithRubric(rubric: unknown): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: 'lantern-grading-' });

  await Deno.mkdir(`${root}/scoring`, { recursive: true });
  await Deno.writeTextFile(`${root}/scoring/rubric.json`, JSON.stringify(rubric, null, 2));

  return root;
}
