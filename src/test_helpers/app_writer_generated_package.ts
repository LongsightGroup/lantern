import type { AppWriterWorkspaceFile } from '../app_writer/types.ts';

export function buildValidSimpleActivityFiles(): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'manifest.json',
      contents: JSON.stringify(
        {
          schema_version: '1',
          app_id: 'phonics-match',
          version: '0.1.0',
          title: 'Phonics Match',
          owner: {
            type: 'user',
            id: 'instructor-1',
          },
          entrypoint: '/dist/index.html',
          roles: ['learner', 'instructor'],
          install_scope: 'course',
          capabilities: ['read_activity_content', 'submit_attempt_event', 'finalize_attempt'],
          grading: {
            mode: 'completion',
            max_score: 100,
          },
          content_files: ['/content/activity.json'],
          preview: {
            fixtures_file: '/preview/fixtures.json',
            tests_file: '/preview/tests.json',
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'dist/index.html',
      contents:
        '<!doctype html><html><head><title>Phonics Match</title><link rel="stylesheet" href="./app.css"></head><body><main data-test="app-title">Phonics Match</main><script src="./app.js"></script></body></html>\n',
    },
    {
      path: 'dist/app.css',
      contents:
        ':root { color-scheme: light; } body { font-family: system-ui, sans-serif; margin: 0; }\n',
    },
    {
      path: 'dist/app.js',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern preview injects window.GatewayApp.");\n  await gateway.getActivityContent();\n  await gateway.emitAttemptEvent({ type: "complete", timestamp: new Date().toISOString() });\n  await gateway.finalizeAttempt({ completionState: "completed" });\n}\nvoid start();\n',
    },
    {
      path: 'content/activity.json',
      contents: JSON.stringify({
        title: 'Phonics Match',
        words: ['cat', 'bat'],
      }),
    },
    {
      path: 'preview/fixtures.json',
      contents: JSON.stringify({
        launch: {
          user_role: 'learner',
          course_id: 'course-1',
          assignment_id: null,
          activity_id: 'phonics-match',
        },
        attempt_id: 'attempt-1',
        local_state: null,
      }),
    },
    {
      path: 'preview/tests.json',
      contents: JSON.stringify([
        {
          name: 'renders title',
          assert: {
            selector: '[data-test="app-title"]',
            text: 'Phonics Match',
          },
        },
      ]),
    },
  ];
}

export function buildValidBrowserAutograderFiles(): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'manifest.json',
      contents: JSON.stringify(
        {
          schema_version: '1',
          app_id: 'web-check',
          version: '0.1.0',
          title: 'Web Check',
          owner: {
            type: 'user',
            id: 'instructor-1',
          },
          entrypoint: '/dist/index.html',
          roles: ['learner', 'instructor'],
          install_scope: 'assignment',
          capabilities: ['read_activity_content', 'submit_evidence_artifact', 'finalize_attempt'],
          grading: {
            mode: 'browser',
            max_score: 100,
          },
          content_files: ['/content/activity.json'],
          preview: {
            fixtures_file: '/preview/fixtures.json',
            tests_file: '/preview/tests.json',
          },
          authoring: {
            kind: 'browser_autograder',
            grader_spec_files: ['/grading/specs/main.js'],
            evidence_example_file: '/evidence/example-output.json',
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'dist/index.html',
      contents:
        '<!doctype html><html><head><title>Web Check</title></head><body><main><h1 data-test="app-title">Web Check</h1><p data-test="score">Waiting</p></main><script src="./app.js"></script></body></html>\n',
    },
    {
      path: 'dist/app.js',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern preview injects window.GatewayApp.");\n  await gateway.getActivityContent();\n  const result = await gateway.runBrowserGrader();\n  const score = document.querySelector("[data-test=\\"score\\"]");\n  if (score) score.textContent = String(result.scoreGiven);\n  await gateway.submitScoreProposal({ scoreGiven: result.scoreGiven, scoreMaximum: result.scoreMaximum });\n  await gateway.finalizeAttempt({ completionState: "completed" });\n}\nvoid start();\n',
    },
    {
      path: 'content/activity.json',
      contents: JSON.stringify({
        title: 'Web Check',
        instructions: 'Submit evidence for a reviewed browser check.',
      }),
    },
    {
      path: 'preview/fixtures.json',
      contents: JSON.stringify({
        launch: {
          user_role: 'learner',
          course_id: 'course-1',
          assignment_id: null,
          activity_id: 'web-check',
        },
        attempt_id: 'attempt-1',
        local_state: null,
      }),
    },
    {
      path: 'preview/tests.json',
      contents: JSON.stringify([
        {
          name: 'renders title',
          assert: {
            selector: '[data-test="app-title"]',
            text: 'Web Check',
          },
        },
        {
          name: 'browser grader produces score',
          assert: {
            selector: '[data-test="score"]',
            text: '100',
          },
        },
      ]),
    },
    {
      path: 'grading/specs/main.js',
      contents:
        'describe("submitted page", () => { it("has the reviewed title", () => { expect(document.querySelector("[data-test=\\"app-title\\"]")?.textContent).toContain("Web Check"); }); });\n',
    },
    {
      path: 'evidence/example-output.json',
      contents: JSON.stringify({
        url: 'about:blank',
        checks: [],
      }),
    },
  ];
}
