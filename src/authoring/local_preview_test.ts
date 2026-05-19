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
  assertEquals(result.appPackage.manifest.authoring?.kind, 'browser_autograder');
  assertEquals(result.appPackage.manifest.authoring?.grader_spec_files, [
    '/grading/specs/checks.spec.js',
  ]);
  assertEquals(
    result.appPackage.manifest.authoring?.evidence_example_file,
    '/evidence/example-output.json',
  );
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
  assertStringIncludes(entrypointBody, 'runBrowserGrader');
  assertStringIncludes(entrypointBody, 'submitEvidenceArtifact');
  assertEquals(
    entrypointBody.indexOf('window.GatewayApp =') < entrypointBody.indexOf('src="./app.js"'),
    true,
  );
  assertEquals(harness.bootstrap.launch.submission_mode, 'anonymous_submission');

  const authorization = `Bearer ${harness.bootstrap.session.token}`;
  const runnerResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/browser-grader/runner.js', {
      headers: {
        authorization,
      },
    }),
  );

  assertEquals(runnerResponse.status, 200);
  assertStringIncludes(runnerResponse.headers.get('content-type') ?? '', 'javascript');

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
      hint:
        'Use Lantern content files for reviewed lesson data, not hard-coded course text in app.js.',
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

  const uploadResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/evidence-artifacts', {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'structured_json',
        contentType: 'application/json',
        fileName: 'submission.json',
        bodyBase64: btoa(JSON.stringify({ score: 100 })),
      }),
    }),
  );
  const invalidUploadResponse = await harness.handle(
    new Request('http://localhost/_lantern/runtime/evidence-artifacts', {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'structured_json',
        contentType: 'image/png',
        fileName: 'submission.json',
        bodyBase64: btoa('invalid'),
      }),
    }),
  );

  assertEquals(uploadResponse.status, 200);
  assertEquals(
    (await uploadResponse.json()) as {
      accepted: boolean;
      artifactId: string;
    },
    {
      accepted: true,
      artifactId: 'local-evidence-1',
    },
  );
  assertEquals(invalidUploadResponse.status, 400);
  const invalidUploadBody = (await invalidUploadResponse.json()) as {
    accepted: boolean;
    denial: {
      code: string;
      capability: string | null;
    };
  };
  assertEquals(invalidUploadBody.accepted, false);
  assertEquals(invalidUploadBody.denial.code, 'invalid_evidence_artifact');
  assertEquals(invalidUploadBody.denial.capability, 'submit_evidence_artifact');

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
