import { assert, assertEquals, assertRejects } from '@std/assert';
import { createCloudflareAppPackageGenerator } from './cloudflare_generator.ts';
import { selectAppWriterContext } from './context.ts';
import type { AppPackageGenerationResult } from './types.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';

Deno.test('Cloudflare app package generator parses JSON model responses', async () => {
  const calls: string[] = [];
  const streamFlags: boolean[] = [];
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(model, input) {
        calls.push(`${model}:${input.messages.at(-1)?.role ?? ''}`);
        streamFlags.push(input.stream);

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: JSON.stringify(buildGenerationResult()),
        });
      },
    },
  });

  const result = await generator.generate({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    requestedAppId: 'phonics-match',
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(calls, ['@cf/test/model:user']);
  assertEquals(streamFlags, [true]);
  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.files.length, buildValidSimpleActivityFiles().length);
  assertEquals(result.progressUpdates[0]?.stage, 'planning_app');
  assertEquals(result.modelRequestMetadata?.[0]?.provider, 'cloudflare');
  assertEquals(result.modelRequestMetadata?.[0]?.model, '@cf/test/model');
  assertEquals(result.modelRequestMetadata?.[0]?.requestId, 'cf-request-1');
});

Deno.test('Cloudflare app package generator reads streaming JSON model responses', async () => {
  const generationJson = JSON.stringify(buildGenerationResult());
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);

        return Promise.resolve(
          createTextStream(
            [
              toEventStreamData(generationJson.slice(0, 80)),
              toEventStreamData(generationJson.slice(80)),
              'data: [DONE]\n\n',
            ].join(''),
          ),
        );
      },
    },
  });

  const result = await generator.generate({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    requestedAppId: 'phonics-match',
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.[0]?.responseCharacters, generationJson.length);
});

Deno.test('Cloudflare app package generator reads JSON-line streaming fragments', async () => {
  const generationJson = JSON.stringify(buildGenerationResult());
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);

        return Promise.resolve(
          createTextStream(
            [
              JSON.stringify({ response: generationJson.slice(0, 80) }),
              JSON.stringify({ response: generationJson.slice(80) }),
              '[DONE]',
            ].join('\n'),
          ),
        );
      },
    },
  });

  const result = await generator.generate({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    requestedAppId: 'phonics-match',
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.[0]?.responseCharacters, generationJson.length);
});

Deno.test('Cloudflare app package generator reads content streaming fragments', async () => {
  const generationJson = JSON.stringify(buildGenerationResult());
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);

        return Promise.resolve(
          createTextStream(
            [
              JSON.stringify({ content: generationJson.slice(0, 80) }),
              JSON.stringify({ content: generationJson.slice(80) }),
              '[DONE]',
            ].join('\n'),
          ),
        );
      },
    },
  });

  const result = await generator.generate({
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText: 'Create a phonics matching game.',
    requestedAppId: 'phonics-match',
    selectedStarterId: 'simple-activity',
    selectedContext: {},
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.[0]?.responseCharacters, generationJson.length);
});

Deno.test('Cloudflare app package generator sends selected prompt context to generation and repair', async () => {
  const capturedPayloads: Record<string, unknown>[] = [];
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        capturedPayloads.push(
          JSON.parse(input.messages.at(-1)?.content ?? '{}') as Record<string, unknown>,
        );

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: JSON.stringify(buildGenerationResult()),
        });
      },
    },
  });
  const selectedContext = selectAppWriterContext({
    promptText:
      'Create phonics flashcards that track usage by each student and produce an instructor report.',
    requestedAppId: 'phonics-flashcards',
  }).selectedContext;
  const generationInput = {
    generationId: 'generation-1',
    ownerId: 'instructor-1',
    promptText:
      'Create phonics flashcards that track usage by each student and produce an instructor report.',
    requestedAppId: 'phonics-flashcards',
    selectedStarterId: 'simple-activity' as const,
    selectedContext,
    createdAt: '2026-05-14T12:00:00.000Z',
  };

  await generator.generate(generationInput);

  if (generator.repair === undefined) {
    throw new Error('Expected Cloudflare generator to support repair.');
  }

  await generator.repair({
    ...generationInput,
    repairAttempt: 1,
    previousResult: buildGenerationResult(),
    validationFindings: [],
  });

  assertEquals(
    capturedPayloads.map((payload) => payload.task),
    ['generate_lantern_app_package', 'repair_lantern_app_package'],
  );

  for (const payload of capturedPayloads) {
    const promptContextText = JSON.stringify(payload.promptContext);

    assert(promptContextText.includes('state-progress-reporting'));
    assert(promptContextText.includes('writeLocalState()'));
    assert(promptContextText.includes('emitAttemptEvent()'));
    assert(JSON.stringify(payload.promptContextRules).includes('authoritative Lantern contract'));
  }
});

Deno.test('Cloudflare app package generator fails clearly on non-JSON model output', async () => {
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, _input) {
        return Promise.resolve({ response: 'not json' });
      },
    },
  });

  await assertRejects(
    () =>
      generator.generate({
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        requestedAppId: 'phonics-match',
        selectedStarterId: 'simple-activity',
        selectedContext: {},
        createdAt: '2026-05-14T12:00:00.000Z',
      }),
    Error,
    'invalid JSON',
  );
});

Deno.test('Cloudflare app package generator rejects oversized model output', async () => {
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    maxResponseCharacters: 10,
    ai: {
      run(_model, _input) {
        return Promise.resolve({
          response: JSON.stringify(buildGenerationResult()),
        });
      },
    },
  });

  await assertRejects(
    () =>
      generator.generate({
        generationId: 'generation-1',
        ownerId: 'instructor-1',
        promptText: 'Create a phonics matching game.',
        requestedAppId: 'phonics-match',
        selectedStarterId: 'simple-activity',
        selectedContext: {},
        createdAt: '2026-05-14T12:00:00.000Z',
      }),
    Error,
    'size limit',
  );
});

function buildGenerationResult(): AppPackageGenerationResult {
  return {
    normalizedRequest: {
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      contentSummary: 'One hundred phonics words.',
      requestedActivity: 'matching game',
      constraints: [],
      missingInformation: [],
      safeToGenerate: true,
    },
    appPlan: {
      appId: 'phonics-match',
      title: 'Phonics Match',
      description: 'A small matching game for phonics practice.',
      learningGoal: 'Practice phonics patterns.',
      audience: 'Grade 1',
      activityType: 'matching',
      learnerFlow: ['Read the sound.', 'Pick the matching word.', 'Complete all cards.'],
      contentModel: {
        wordCount: 100,
      },
      capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
      grading: {
        mode: 'completion',
        maxScore: 100,
        scoringSummary: 'Completion credit after all cards are answered.',
      },
      attemptEvents: [
        {
          when: 'after each answer',
          eventType: 'answer',
          questionIdPattern: 'word-*',
        },
      ],
      previewTests: ['renders the title'],
      accessibilityNotes: ['Use buttons for answer choices.'],
      riskNotes: [],
    },
    selectedStarterId: 'simple-activity',
    files: buildValidSimpleActivityFiles(),
    progressUpdates: [
      {
        stage: 'planning_app',
        message: 'Planning a phonics activity with clear learner steps.',
      },
    ],
    notes: ['Generated by fake Cloudflare AI.'],
    validationFindings: [],
  };
}

function createTextStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function toEventStreamData(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}
