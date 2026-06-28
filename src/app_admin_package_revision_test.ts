import { assertEquals, assertStringIncludes } from '@std/assert';
import { createApp } from './app.ts';
import { buildRevisionAuthoringPrompt } from './app_writer/revision_authoring_prompt.ts';
import { createObjectEnvReader } from './platform/env.ts';
import {
  buildPackageVersionRecord,
  createInMemoryPackageReviewRepository,
} from './test_helpers/package_review.ts';

Deno.test('revision authoring prompt uses the exact package plan and reviewed runtime contract', () => {
  const packageVersion = buildPackageVersionRecord({
    appId: 'phonics-match',
    version: '0.1.0',
    title: 'Phonics Match',
    description: 'Practice beginning sounds.',
    capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    grading: {
      mode: 'completion',
      rubricFile: null,
      maxScore: 10,
    },
    manifestJson: {
      app_id: 'phonics-match',
      version: '0.1.0',
      title: 'Phonics Match',
      content_files: ['/content/activity.json'],
    },
  });
  const prompt = buildRevisionAuthoringPrompt({
    packageVersion,
    targetVersion: '0.3.0',
  });

  assertStringIncludes(prompt, 'Revise the reviewed Lantern learning app "Phonics Match".');
  assertStringIncludes(prompt, '"appId": "phonics-match"');
  assertStringIncludes(prompt, '"sourceVersion": "0.1.0"');
  assertStringIncludes(prompt, '"targetVersion": "0.3.0"');
  assertStringIncludes(prompt, '"read_activity_content"');
  assertStringIncludes(prompt, '"submit_attempt_event"');
  assertStringIncludes(prompt, '"finalize_attempt"');
  assertStringIncludes(prompt, '"runtimeContract"');
  assertStringIncludes(prompt, '"content_files"');
  assertStringIncludes(prompt, 'Requested change:');
});

Deno.test('GET /admin/packages/:appId/versions/:version/revise renders App Writer revision form', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        appId: 'phonics-match',
        version: '0.1.0',
        title: 'Phonics Match',
        description: 'Practice beginning sounds.',
        capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
        grading: {
          mode: 'completion',
          rubricFile: null,
          maxScore: 10,
        },
        manifestJson: {
          app_id: 'phonics-match',
          version: '0.1.0',
          title: 'Phonics Match',
          content_files: ['/content/activity.json'],
        },
      }),
      buildPackageVersionRecord({
        id: 2,
        appId: 'phonics-match',
        version: '0.2.0',
        title: 'Phonics Match',
      }),
    ],
  });
  const response = await createAdminApp({
    getRepository: () => repository,
  }).request('http://localhost/admin/packages/phonics-match/versions/0.1.0/revise');

  assertEquals(response.status, 200);
  const body = await response.text();

  assertStringIncludes(body, 'Revise Phonics Match');
  assertStringIncludes(body, 'Copyable authoring prompt');
  assertStringIncludes(body, 'Exact app plan and capability contract');
  assertStringIncludes(body, 'data-copy-authoring-prompt');
  assertStringIncludes(body, 'Revise the reviewed Lantern learning app &quot;Phonics Match&quot;.');
  assertStringIncludes(body, '&quot;appId&quot;: &quot;phonics-match&quot;');
  assertStringIncludes(body, '&quot;sourceVersion&quot;: &quot;0.1.0&quot;');
  assertStringIncludes(body, '&quot;targetVersion&quot;: &quot;0.3.0&quot;');
  assertStringIncludes(body, '&quot;read_activity_content&quot;');
  assertStringIncludes(body, '&quot;submit_attempt_event&quot;');
  assertStringIncludes(body, '&quot;finalize_attempt&quot;');
  assertStringIncludes(body, '&quot;runtimeContract&quot;');
  assertStringIncludes(body, '&quot;content_files&quot;');
  assertStringIncludes(body, 'name="promptText"');
  assertStringIncludes(body, 'Requested change:');
  assertStringIncludes(body, 'name="targetVersion" value="0.3.0"');
  assertStringIncludes(body, 'Revise app');
});

Deno.test('POST /admin/packages/:appId/versions/:version/revise creates a revision run and redirects to App Writer progress', async () => {
  const repository = createInMemoryPackageReviewRepository({
    packageVersions: [
      buildPackageVersionRecord({
        id: 7,
        appId: 'phonics-match',
        version: '0.1.0',
        title: 'Phonics Match',
        capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
        grading: {
          mode: 'completion',
          rubricFile: null,
          maxScore: 100,
        },
      }),
    ],
  });
  const formData = new FormData();

  formData.set('promptText', 'Add printable instructor reports.');
  formData.set('targetVersion', '0.2.0');

  const response = await createAdminApp({
    getRepository: () => repository,
    appGenerationRunScheduler: {
      schedule(input) {
        return Promise.resolve({
          mode: 'workflow',
          workflowInstanceId: `workflow-${input.generationId}`,
        });
      },
    },
  }).request('http://localhost/admin/packages/phonics-match/versions/0.1.0/revise', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: formData,
  });

  assertEquals(response.status, 303);
  assertStringIncludes(response.headers.get('location') ?? '', '/admin/app-writer/runs/');

  const queuedEvents = await repository.listAuditEventsByEventType('app_generation.generating');
  const runId = String(queuedEvents[0]?.detail.generationId ?? '');
  const run = await repository.getAppGenerationRunById(runId);

  assertEquals(run?.requestedAppId, 'phonics-match');
  assertEquals(run?.generatedVersion, null);
  assertEquals(run?.selectedContext.revision, {
    sourcePackageVersionId: 7,
    sourceAppId: 'phonics-match',
    sourceVersion: '0.1.0',
    sourceTitle: 'Phonics Match',
    sourceDescription: 'Shoot the correct vocabulary target.',
    sourceCapabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
    sourceGradingMode: 'completion',
    sourceMaxScore: 100,
    targetVersion: '0.2.0',
  });
});

function createAdminApp(services: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    env: createObjectEnvReader({
      APP_ORIGIN: 'http://localhost',
      LANTERN_OPERATOR_NAME: 'Signed in',
    }),
    ...services,
  });
}
