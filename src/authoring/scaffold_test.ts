import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { test } from 'vite-plus/test';
import { tmpdir } from 'node:os';
import { assertEquals, assertStringIncludes } from '@std/assert';
import { validateLocalAppPackage } from './local_app.ts';
import { createLocalPreviewHarness } from './local_preview.ts';
import { listScaffoldStarters, scaffoldLocalAppPackage } from './scaffold.ts';

test('listScaffoldStarters exposes the curated starter set', () => {
  assertEquals(listScaffoldStarters(), [
    {
      id: 'simple-activity',
      label: 'Simple Activity',
      description: 'Minimal completion-graded learner activity starter.',
    },
    {
      id: 'browser-autograder',
      label: 'Browser Autograder',
      description: 'Minimal browser-graded activity starter with reviewed specs.',
    },
  ]);
});

test('scaffoldLocalAppPackage writes a simple activity package that validates and previews', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'lantern-scaffold-'));
  const outputRoot = `${tempRoot}/cell-review`;

  try {
    const result = await scaffoldLocalAppPackage({
      starter: 'simple-activity',
      outputRoot,
      appId: 'cell-review',
      title: 'Cell Review',
      ownerId: 'instructor_456',
    });
    const validation = await validateLocalAppPackage(outputRoot);

    assertEquals(result.starter.id, 'simple-activity');
    assertEquals(validation.ok, true);

    if (!validation.ok || !validation.appPackage) {
      throw new Error(
        `Expected scaffolded package to validate: ${JSON.stringify(validation.issues)}`,
      );
    }

    const appSource = await readFile(`${outputRoot}/dist/app.js`, 'utf8');
    const contentSource = await readFile(`${outputRoot}/content/activity.json`, 'utf8');
    const fixturesSource = await readFile(`${outputRoot}/preview/fixtures.json`, 'utf8');

    assertEquals(validation.appPackage.reviewData.appId, 'cell-review');
    assertEquals(validation.appPackage.manifest.title, 'Cell Review');
    assertEquals(validation.appPackage.manifest.owner.id, 'instructor_456');
    assertEquals(validation.appPackage.fixtureData.launch.activity_id, 'cell-review');
    assertEquals(validation.appPackage.fixtureData.attempt_id, 'attempt_cell_review_demo');
    assertEquals(validation.appPackage.previewTests[0]?.assert.text, 'Cell Review');
    assertEquals(appSource.includes('GatewayApp ?? null'), false);
    assertStringIncludes(appSource, 'window.GatewayApp');
    assertStringIncludes(contentSource, '"title": "Cell Review"');
    assertStringIncludes(fixturesSource, '"activity_id": "cell-review"');

    const harness = createLocalPreviewHarness({
      appPackage: validation.appPackage,
    });
    const entrypointResponse = await harness.handle(
      new Request('http://localhost/dist/index.html'),
    );
    const entrypointBody = await entrypointResponse.text();

    assertEquals(entrypointResponse.status, 200);
    assertStringIncludes(entrypointBody, 'window.GatewayApp =');
    assertStringIncludes(entrypointBody, 'data-test="progress-button"');
    assertStringIncludes(entrypointBody, 'data-test="complete-button"');
  } finally {
    await rm(tempRoot, { recursive: true });
  }
});

test('scaffoldLocalAppPackage writes a browser autograder package with coherent metadata artifacts', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'lantern-scaffold-'));
  const outputRoot = `${tempRoot}/dom-check`;

  try {
    const result = await scaffoldLocalAppPackage({
      starter: 'browser-autograder',
      outputRoot,
      appId: 'dom-check',
      title: 'DOM Check',
      ownerId: 'author_789',
    });
    const validation = await validateLocalAppPackage(outputRoot);

    assertEquals(result.starter.id, 'browser-autograder');
    assertEquals(validation.ok, true);

    if (!validation.ok || !validation.appPackage) {
      throw new Error(
        `Expected scaffolded browser autograder to validate: ${JSON.stringify(validation.issues)}`,
      );
    }

    const previewTestsSource = await readFile(`${outputRoot}/preview/tests.json`, 'utf8');
    const graderSpecSource = await readFile(`${outputRoot}/grading/specs/checks.spec.js`, 'utf8');
    const entrypointSource = await readFile(`${outputRoot}/dist/index.html`, 'utf8');
    const appSource = await readFile(`${outputRoot}/dist/app.js`, 'utf8');

    assertEquals(validation.appPackage.reviewData.appId, 'dom-check');
    assertEquals(validation.appPackage.manifest.title, 'DOM Check');
    assertEquals(validation.appPackage.manifest.owner.id, 'author_789');
    assertEquals(validation.appPackage.manifest.grading.mode, 'browser');
    assertEquals(validation.appPackage.manifest.authoring?.kind, 'browser_autograder');
    assertEquals(validation.appPackage.fixtureData.launch.activity_id, 'dom-check');
    assertEquals(validation.appPackage.fixtureData.attempt_id, 'attempt_dom_check_demo');
    assertEquals(validation.appPackage.previewTests[0]?.assert.text, 'DOM Check');
    assertEquals(previewTestsSource.includes('Template App'), false);
    assertEquals(graderSpecSource.includes('Template App'), false);
    assertStringIncludes(previewTestsSource, '"text": "DOM Check"');
    assertStringIncludes(graderSpecSource, '"DOM Check"');
    assertStringIncludes(entrypointSource, 'DOM Check');
    assertStringIncludes(appSource, '"DOM Check"');

    const harness = createLocalPreviewHarness({
      appPackage: validation.appPackage,
    });
    const entrypointResponse = await harness.handle(
      new Request('http://localhost/dist/index.html'),
    );
    const authorization = `Bearer ${harness.bootstrap.session.token}`;
    const runnerResponse = await harness.handle(
      new Request('http://localhost/_lantern/runtime/browser-grader/runner.js', {
        headers: {
          authorization,
        },
      }),
    );

    assertEquals(entrypointResponse.status, 200);
    assertEquals(runnerResponse.status, 200);
    assertStringIncludes(await entrypointResponse.text(), 'runBrowserGrader');
    assertStringIncludes(await runnerResponse.text(), "./reviewed/' + index + '.js");
  } finally {
    await rm(tempRoot, { recursive: true });
  }
});
