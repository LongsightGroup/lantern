import { assertEquals, assertStringIncludes } from '@std/assert';
import { validateLocalAppPackage } from './local_app.ts';
import { createLocalPreviewHarness } from './local_preview.ts';

const TEMPLATE_APP_ROOT = 'examples/apps/template';

Deno.test('validateLocalAppPackage accepts the template app', async () => {
  const result = await validateLocalAppPackage(TEMPLATE_APP_ROOT);

  assertEquals(result.ok, true);

  if (!result.ok || !result.appPackage) {
    throw new Error(`Expected template app to validate: ${JSON.stringify(result.issues)}`);
  }

  assertEquals(result.appPackage.reviewData.appId, 'template-app');
  assertEquals(result.appPackage.previewTests.length, 4);
  assertEquals(result.appPackage.fixtureData.attempt_id, 'attempt_template_demo');
  assertEquals(result.appPackage.contentPath, '/content/activity.json');
});

Deno.test('local preview harness injects GatewayApp and serves preview state', async () => {
  const validation = await validateLocalAppPackage(TEMPLATE_APP_ROOT);

  assertEquals(validation.ok, true);

  if (!validation.ok || !validation.appPackage) {
    throw new Error(`Expected template app to validate: ${JSON.stringify(validation.issues)}`);
  }

  const harness = createLocalPreviewHarness({
    appPackage: validation.appPackage,
  });
  const entrypointResponse = await harness.handle(new Request('http://localhost/dist/index.html'));
  const entrypointBody = await entrypointResponse.text();

  assertEquals(entrypointResponse.status, 200);
  assertStringIncludes(entrypointBody, 'window.GatewayApp =');
  assertStringIncludes(entrypointBody, 'window.GatewayBootstrap =');

  const authorization = `Bearer ${harness.bootstrap.session.token}`;
  const contentResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/content', {
      headers: {
        authorization,
      },
    }),
  );

  assertEquals(contentResponse.status, 200);
  assertEquals(
    (await contentResponse.json()) as {
      title: string;
      instructions: string;
      prompt: string;
      hint: string;
    },
    {
      title: 'Template App',
      instructions:
        'Edit this file first. Keep the app logic small and move lesson-specific data here.',
      prompt: 'What is the one question or interaction this app should teach?',
      hint: 'Use Lantern content files for reviewed lesson data, not hard-coded course text in app.js.',
    },
  );

  const writeLocalStateResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/local-state', {
      method: 'PUT',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answers: 7,
        finalized: 'completed',
      }),
    }),
  );

  assertEquals(writeLocalStateResponse.status, 204);

  const readLocalStateResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/local-state', {
      headers: {
        authorization,
      },
    }),
  );

  assertEquals(readLocalStateResponse.status, 200);
  assertEquals(
    (await readLocalStateResponse.json()) as {
      answers: number;
      finalized: string;
    },
    {
      answers: 7,
      finalized: 'completed',
    },
  );

  const finalizeResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/finalize', {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        completionState: 'completed',
      }),
    }),
  );

  assertEquals(finalizeResponse.status, 200);
  assertEquals(
    (await finalizeResponse.json()) as {
      accepted: boolean;
      attemptId: string;
      alreadyFinalized: boolean;
      completionState: string | null;
      scoreGiven: number;
      scoreMaximum: number;
      gradePublished: boolean;
    },
    {
      accepted: true,
      attemptId: 'attempt_template_demo',
      completionState: 'completed',
      scoreGiven: 0,
      scoreMaximum: 100,
      alreadyFinalized: false,
      gradePublished: false,
    },
  );
});
