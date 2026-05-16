import { assert, assertEquals, assertRejects } from '@std/assert';
import { createCloudflareAppPackageGenerator } from './cloudflare_generator.ts';
import { selectAppWriterContext } from './context.ts';
import { APP_WRITER_RECIPE_ID } from './recipe.ts';
import type { AppPackageGenerationResult, AppWriterWorkspaceFile } from './types.ts';
import { buildValidSimpleActivityFiles } from '../test_helpers/app_writer_generated_package.ts';

Deno.test('Cloudflare app package generator uses JSON planning and raw file responses', async () => {
  const calls: string[] = [];
  const streamFlags: boolean[] = [];
  const responseFormats: Array<unknown> = [];
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(model, input) {
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          targetFile?: { path?: string };
        };
        calls.push(`${model}:${payload.task ?? ''}:${payload.targetFile?.path ?? ''}`);
        streamFlags.push(input.stream);
        responseFormats.push(input.response_format);

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: buildModelTextForPayload(payload),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(calls, [
    '@cf/test/model:plan_lantern_app_package:',
    '@cf/test/model:write_lantern_app_workspace_file:manifest.json',
    '@cf/test/model:write_lantern_app_workspace_file:content/activity.json',
    '@cf/test/model:write_lantern_app_workspace_file:dist/index.html',
    '@cf/test/model:write_lantern_app_workspace_file:dist/app.js',
    '@cf/test/model:write_lantern_app_workspace_file:dist/app.css',
    '@cf/test/model:write_lantern_app_workspace_file:preview/fixtures.json',
    '@cf/test/model:write_lantern_app_workspace_file:preview/tests.json',
  ]);
  assertEquals(streamFlags.every(Boolean), true);
  assertEquals(responseFormats[0], { type: 'json_object' });
  assertEquals(
    responseFormats.slice(1).every((format) => format === undefined),
    true,
  );
  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(
    result.files.some((file) => file.path === 'dist/app.css'),
    true,
  );
  assertEquals(result.progressUpdates[0]?.stage, 'planning_app');
  assertEquals(result.modelRequestMetadata?.[0]?.provider, 'cloudflare');
  assertEquals(result.modelRequestMetadata?.[0]?.model, '@cf/test/model');
  assertEquals(result.modelRequestMetadata?.[0]?.requestId, 'cf-request-1');
  assertEquals(result.modelRequestMetadata?.length, 8);
});

Deno.test('Cloudflare app package generator can request TypeScript authoring edits', async () => {
  const capturedPayloads: Record<string, unknown>[] = [];
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
        };
        capturedPayloads.push(payload as Record<string, unknown>);

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: buildModelTextForPayload(payload),
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
    authoringMode: 'typescript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });
  const filePayload = capturedPayloads.find(
    (payload) => readPayloadTargetPath(payload) === 'source/app.ts',
  ) as {
    authoringMode?: unknown;
    outputContract?: {
      outputKind?: unknown;
      fileContents?: { required?: unknown; note?: unknown };
    };
    starterWorkspace?: { availablePaths?: unknown[] };
  };

  assertEquals(filePayload.authoringMode, 'typescript');
  assertEquals(filePayload.outputContract?.outputKind, 'raw_file_contents');
  assertEquals(
    String(filePayload.outputContract?.fileContents?.required).includes('source/app.ts'),
    true,
  );
  assertEquals(
    String(filePayload.outputContract?.fileContents?.note).includes('Do not return dist/app.js'),
    true,
  );
  assertEquals(filePayload.starterWorkspace?.availablePaths?.includes('source/app.ts'), true);
  assertEquals(filePayload.starterWorkspace?.availablePaths?.includes('dist/app.js'), false);
  assertEquals(
    result.files.some((file) => file.path === 'source/app.ts'),
    true,
  );
  assertEquals(
    result.files.some((file) => file.path === 'dist/app.js'),
    false,
  );
});

Deno.test('Cloudflare app package generator reads streaming raw file model responses', async () => {
  let firstFileText = '';
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          authoringMode?: unknown;
          targetFile?: unknown;
        };

        if (payload.task === 'plan_lantern_app_package') {
          return Promise.resolve({
            response: JSON.stringify(buildPlanningResult()),
          });
        }

        const fileText = buildRawFileTextForPayload(payload);
        if (firstFileText === '') {
          firstFileText = fileText;
        }

        return Promise.resolve(
          createTextStream(
            [
              toEventStreamData(fileText.slice(0, 80)),
              toEventStreamData(fileText.slice(80)),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.[1]?.responseCharacters, firstFileText.length);
});

Deno.test('Cloudflare app package generator stops streaming at the done marker', async () => {
  let streamCanceled = false;
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    modelRequestTimeoutMs: 1_000,
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          authoringMode?: unknown;
          targetFile?: unknown;
        };

        if (payload.task === 'plan_lantern_app_package') {
          return Promise.resolve({
            response: JSON.stringify(buildPlanningResult()),
          });
        }

        const fileText = buildRawFileTextForPayload(payload);

        return Promise.resolve(
          createHangingTextStream(
            [
              toEventStreamData(fileText.slice(0, 80)),
              toEventStreamData(fileText.slice(80)),
              'data: [DONE]\n\n',
            ].join(''),
            () => {
              streamCanceled = true;
            },
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(streamCanceled, true);
});

Deno.test('Cloudflare app package generator times out hanging model streams', async () => {
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    modelRequestTimeoutMs: 5,
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);

        return Promise.resolve(createHangingTextStream(toEventStreamData('{"partial":'), () => {}));
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
        authoringMode: 'javascript',
        createdAt: '2026-05-14T12:00:00.000Z',
      }),
    Error,
    'timed out',
  );
});

Deno.test('Cloudflare app package generator retries transient provider capacity errors', async () => {
  const calls: string[] = [];
  let manifestFailures = 0;
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    modelTransientErrorRetryDelaysMs: [0],
    ai: {
      run(_model, input) {
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          authoringMode?: unknown;
          targetFile?: { path?: string };
        };
        const targetPath = payload.targetFile?.path ?? '';
        calls.push(`${payload.task ?? ''}:${targetPath}`);

        if (
          payload.task === 'write_lantern_app_workspace_file' &&
          targetPath === 'manifest.json' &&
          manifestFailures === 0
        ) {
          manifestFailures += 1;
          return Promise.reject(
            new Error('3040: Capacity temporarily exceeded, please try again.'),
          );
        }

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: buildModelTextForPayload(payload),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(manifestFailures, 1);
  assertEquals(
    calls.filter((call) => call === 'write_lantern_app_workspace_file:manifest.json').length,
    2,
  );
});

Deno.test('Cloudflare app package generator retries transient provider internal errors', async () => {
  let contentFailures = 0;
  let distFailures = 0;
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    modelTransientErrorRetryDelaysMs: [0],
    ai: {
      run(_model, input) {
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          targetFile?: { path?: string };
        };

        if (
          payload.task === 'write_lantern_app_workspace_file' &&
          payload.targetFile?.path === 'content/activity.json' &&
          contentFailures === 0
        ) {
          contentFailures += 1;
          return Promise.reject(new Error('8008: Internal server error'));
        }

        if (
          payload.task === 'write_lantern_app_workspace_file' &&
          payload.targetFile?.path === 'dist/index.html' &&
          distFailures === 0
        ) {
          distFailures += 1;
          return Promise.reject(new Error('3045: Unknown internal error'));
        }

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: buildModelTextForPayload(payload),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(contentFailures, 1);
  assertEquals(distFailures, 1);
});

Deno.test('Cloudflare app package generator reads JSON-line streaming raw fragments', async () => {
  let firstFileText = '';
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          authoringMode?: unknown;
          targetFile?: unknown;
        };

        if (payload.task === 'plan_lantern_app_package') {
          return Promise.resolve({
            response: JSON.stringify(buildPlanningResult()),
          });
        }

        const fileText = buildRawFileTextForPayload(payload);
        if (firstFileText === '') {
          firstFileText = fileText;
        }

        return Promise.resolve(
          createTextStream(
            [
              JSON.stringify({ response: fileText.slice(0, 80) }),
              JSON.stringify({ response: fileText.slice(80) }),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.[1]?.responseCharacters, firstFileText.length);
});

Deno.test('Cloudflare app package generator reads content streaming raw fragments', async () => {
  let firstFileText = '';
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        assertEquals(input.stream, true);
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          authoringMode?: unknown;
          targetFile?: unknown;
        };

        if (payload.task === 'plan_lantern_app_package') {
          return Promise.resolve({
            response: JSON.stringify(buildPlanningResult()),
          });
        }

        const fileText = buildRawFileTextForPayload(payload);
        if (firstFileText === '') {
          firstFileText = fileText;
        }

        return Promise.resolve(
          createTextStream(
            [
              JSON.stringify({ content: fileText.slice(0, 80) }),
              JSON.stringify({ content: fileText.slice(80) }),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.[1]?.responseCharacters, firstFileText.length);
});

Deno.test('Cloudflare app package generator repairs invalid JSON contract output once', async () => {
  const capturedTasks: string[] = [];
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          targetFile?: { path?: string };
        };
        capturedTasks.push(`${payload.task ?? ''}:${payload.targetFile?.path ?? ''}`);

        if (capturedTasks.length === 1) {
          return Promise.resolve({
            requestId: 'cf-request-1',
            response: JSON.stringify({ normalizedRequest: {} }),
          });
        }

        if (payload.task === 'repair_lantern_app_package_json_contract') {
          return Promise.resolve({
            requestId: 'cf-request-2',
            response: JSON.stringify(buildPlanningResult()),
          });
        }

        return Promise.resolve({
          requestId: 'cf-request-3',
          response: buildRawFileTextForPayload(payload),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });

  assertEquals(capturedTasks, [
    'plan_lantern_app_package:',
    'repair_lantern_app_package_json_contract:',
    'write_lantern_app_workspace_file:manifest.json',
    'write_lantern_app_workspace_file:content/activity.json',
    'write_lantern_app_workspace_file:dist/index.html',
    'write_lantern_app_workspace_file:dist/app.js',
    'write_lantern_app_workspace_file:dist/app.css',
    'write_lantern_app_workspace_file:preview/fixtures.json',
    'write_lantern_app_workspace_file:preview/tests.json',
  ]);
  assertEquals(result.appPlan.appId, 'phonics-match');
  assertEquals(result.modelRequestMetadata?.map((metadata) => metadata.requestId).slice(0, 3), [
    'cf-request-1',
    'cf-request-2',
    'cf-request-3',
  ]);
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
        const payload = capturedPayloads.at(-1) as {
          task?: string;
          targetFile?: { path?: string };
        };

        return Promise.resolve({
          requestId: 'cf-request-1',
          response: buildModelTextForPayload(payload),
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
    authoringMode: 'javascript' as const,
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

  assertEquals(capturedPayloads[0]?.task, 'plan_lantern_app_package');
  assert(capturedPayloads.some((payload) => payload.task === 'write_lantern_app_workspace_file'));
  assert(capturedPayloads.some((payload) => payload.task === 'repair_lantern_app_workspace_file'));

  for (const payload of capturedPayloads) {
    const promptContextText = JSON.stringify(payload.promptContext);

    assert(promptContextText.includes('state-progress-reporting'));
    assert(promptContextText.includes('writeLocalState()'));
    assert(promptContextText.includes('emitAttemptEvent()'));
    assert(JSON.stringify(payload.promptContextRules).includes('authoritative Lantern contract'));
    assert(JSON.stringify(payload.appWriterRecipe).includes(APP_WRITER_RECIPE_ID));
  }

  const filePayload = capturedPayloads.find(
    (payload) => payload.task === 'write_lantern_app_workspace_file',
  ) as {
    starterWorkspace?: { instructions?: string };
  };
  assert(filePayload.starterWorkspace?.instructions?.includes('Generated App Workspace'));

  const planningPayload = capturedPayloads[0] as {
    outputContract?: {
      appPlan?: {
        shape?: {
          grading?: {
            scoringSummary?: string;
          };
        };
        capabilities?: {
          allowedValues?: string[];
          rules?: string[];
        };
      };
    };
  };
  assert(
    planningPayload.outputContract?.appPlan?.capabilities?.allowedValues?.includes(
      'read_local_state',
    ),
  );
  assert(
    planningPayload.outputContract?.appPlan?.capabilities?.allowedValues?.includes(
      'write_local_state',
    ),
  );
  assert(
    JSON.stringify(planningPayload.outputContract?.appPlan?.capabilities?.rules).includes(
      'Do not invent capability names',
    ),
  );
  assert(
    planningPayload.outputContract?.appPlan?.shape?.grading?.scoringSummary?.includes(
      'non-empty sentence',
    ),
  );
});

Deno.test('Cloudflare app package generator strips full markdown fences from raw file output', async () => {
  const generator = createCloudflareAppPackageGenerator({
    model: '@cf/test/model',
    ai: {
      run(_model, input) {
        const payload = JSON.parse(input.messages.at(-1)?.content ?? '{}') as {
          task?: string;
          targetFile?: { path?: string };
        };

        if (payload.task === 'plan_lantern_app_package') {
          return Promise.resolve({
            response: JSON.stringify(buildPlanningResult()),
          });
        }

        if (payload.targetFile?.path === 'manifest.json') {
          return Promise.resolve({
            response: `\`\`\`json\n${buildRawFileTextForPayload(payload)}\n\`\`\``,
          });
        }

        return Promise.resolve({
          response: buildRawFileTextForPayload(payload),
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
    authoringMode: 'javascript',
    createdAt: '2026-05-14T12:00:00.000Z',
  });
  const manifest = result.files.find((file) => file.path === 'manifest.json');

  assert(manifest);
  assertEquals(manifest.contents.startsWith('```'), false);
  assertEquals(JSON.parse(manifest.contents).app_id, 'phonics-match');
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
        authoringMode: 'javascript',
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
        authoringMode: 'javascript',
        createdAt: '2026-05-14T12:00:00.000Z',
      }),
    Error,
    'size limit',
  );
});

function buildModelTextForPayload(payload: {
  task?: string;
  authoringMode?: unknown;
  targetFile?: unknown;
}): string {
  if (payload.task === 'plan_lantern_app_package') {
    return JSON.stringify(buildPlanningResult());
  }

  return buildRawFileTextForPayload(payload);
}

function buildRawFileTextForPayload(payload: {
  authoringMode?: unknown;
  targetFile?: unknown;
}): string {
  const targetPath = readPayloadTargetPath(payload);
  const files =
    payload.authoringMode === 'typescript'
      ? buildTypeScriptFileEdits()
      : buildValidSimpleActivityFiles();
  const file = files.find((candidate) => candidate.path === targetPath);

  if (file === undefined) {
    throw new Error(`No fake model file for target ${targetPath}.`);
  }

  return file.contents;
}

function readPayloadTargetPath(payload: { targetFile?: unknown }): string {
  const targetFile = payload.targetFile;

  if (targetFile === null || typeof targetFile !== 'object' || Array.isArray(targetFile)) {
    return '';
  }

  const path = (targetFile as { path?: unknown }).path;

  return typeof path === 'string' ? path : '';
}

function buildPlanningResult(): Record<string, unknown> {
  const generation = buildGenerationResult();

  return {
    normalizedRequest: generation.normalizedRequest,
    appPlan: generation.appPlan,
    selectedStarterId: generation.selectedStarterId,
    progressUpdates: generation.progressUpdates,
    notes: ['Planned by fake Cloudflare AI.'],
  };
}

function buildTypeScriptFileEdits(): AppWriterWorkspaceFile[] {
  return [
    ...buildValidSimpleActivityFiles().filter((file) => file.path !== 'dist/app.js'),
    {
      path: 'source/content_model.ts',
      contents: 'interface ActivityContent {\n  title: string;\n  words: string[];\n}\n',
    },
    {
      path: 'source/app.ts',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern injects window.GatewayApp.");\n  const content = await gateway.getActivityContent<ActivityContent>();\n  document.body.textContent = content.title;\n}\nvoid start();\n',
    },
  ];
}

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

function createHangingTextStream(text: string, onCancel: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
    },
    cancel() {
      onCancel();
    },
  });
}

function toEventStreamData(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}
