import { createMemoryPackageSource, type PackageSource } from '../package_review/package_source.ts';
import type { PublicPythonAssignmentContent } from './contract.ts';

export const PYTHON_LAB_PACKAGE_RELATIVE_PATHS = [
  'manifest.json',
  'content/activity.json',
  'preview/fixtures.json',
  'preview/tests.json',
  'dist/index.html',
] as const;

export function createPythonLabPackageSource(input: {
  readonly labId: string;
  readonly content: PublicPythonAssignmentContent;
}): PackageSource {
  const appId = `python-lab-${input.labId}`;
  const manifest = {
    schema_version: '2',
    app_id: appId,
    version: '1.0.0',
    title: input.content.title,
    description: 'A Lantern-reviewed Python function assignment.',
    owner: { type: 'user', id: 'python-lab-author' },
    runtime: { kind: 'browser', entrypoint: '/dist/index.html' },
    roles: ['learner', 'instructor'],
    install_scope: 'assignment',
    capabilities: ['read_launch_context', 'read_activity_content', 'run_code_submission'],
    grading: { mode: 'sandbox', max_score: 10 },
    content_files: ['/content/activity.json'],
    preview: {
      fixtures_file: '/preview/fixtures.json',
      tests_file: '/preview/tests.json',
    },
    authoring: { kind: 'python_function' },
  };

  return createMemoryPackageSource([
    { relativePath: 'manifest.json', bytes: JSON.stringify(manifest, null, 2) },
    { relativePath: 'content/activity.json', bytes: JSON.stringify(input.content) },
    { relativePath: 'preview/fixtures.json', bytes: JSON.stringify(PREVIEW_FIXTURES) },
    { relativePath: 'preview/tests.json', bytes: JSON.stringify(PREVIEW_TESTS) },
    { relativePath: 'dist/index.html', bytes: PYTHON_ASSIGNMENT_HTML },
  ]);
}

const PREVIEW_FIXTURES = {
  launch: {
    user_role: 'learner',
    course_id: 'python-lab-preview',
    assignment_id: 'python-function-assignment',
    activity_id: '/content/activity.json',
  },
  attempt_id: 'python-lab-preview-attempt',
  local_state: null,
};

const PREVIEW_TESTS = {
  name: 'Python function learner engine',
  assertions: [
    { selector: '#source', exists: true },
    { selector: '#run-public-tests', exists: true },
    { selector: '#final-submit', exists: true },
  ],
};

const PYTHON_ASSIGNMENT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Python assignment</title>
    <style>
      :root { --ink:#172a3a; --muted:#617587; --line:#cbd8e1; --panel:#f7fafc; --blue:#155e75; --blue-dark:#0f4658; --green:#166534; --red:#b42318; --focus:#eab308; font-family:ui-sans-serif,system-ui,sans-serif; color:var(--ink); }
      * { box-sizing:border-box; }
      body { margin:0; background:#edf3f6; }
      main { width:min(1120px,calc(100% - 32px)); margin:0 auto; padding:28px 0 48px; }
      header { border-bottom:1px solid var(--line); padding-bottom:18px; margin-bottom:22px; }
      h1 { margin:0 0 8px; font-size:1.65rem; letter-spacing:0; }
      h2 { margin:0 0 10px; font-size:1rem; letter-spacing:0; }
      p { margin:0; color:var(--muted); white-space:pre-wrap; }
      .grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(250px,.8fr); gap:18px; align-items:start; }
      .panel { background:#fff; border:1px solid var(--line); border-radius:6px; padding:16px; }
      label { display:block; font-weight:700; margin-bottom:8px; }
      textarea { width:100%; min-height:420px; resize:vertical; border:1px solid #90a4b4; border-radius:4px; padding:12px; color:#102a43; background:#fbfdff; font:14px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; tab-size:4; }
      textarea:focus, button:focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
      .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
      button { min-height:40px; border:1px solid var(--blue); border-radius:4px; padding:0 14px; background:var(--blue); color:#fff; font:inherit; font-weight:700; cursor:pointer; }
      button:hover:not(:disabled) { background:var(--blue-dark); }
      button.secondary { color:var(--blue); background:#fff; }
      button:disabled { opacity:.6; cursor:wait; }
      .status { min-height:24px; margin-top:12px; font-weight:700; }
      .score { margin:8px 0 0; color:var(--ink); font-weight:700; }
      ul { margin:0; padding-left:20px; }
      li { margin:8px 0; color:var(--muted); }
      .pass { color:var(--green); } .fail { color:var(--red); }
      .test-input { display:block; margin-top:2px; font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace; color:#425466; white-space:pre-wrap; }
      @media (max-width:760px) { main { width:min(100% - 24px,1120px); padding-top:18px; } .grid { grid-template-columns:1fr; } textarea { min-height:300px; } }
    </style>
  </head>
  <body>
    <main>
      <header><h1 id="title">Python function assignment</h1><p id="prompt"></p></header>
      <div class="grid">
        <section class="panel" aria-labelledby="editor-heading">
          <h2 id="editor-heading">solution.py</h2>
          <label for="source">Python source</label>
          <textarea id="source" spellcheck="false" aria-describedby="status"></textarea>
          <div class="actions">
            <button id="run-public-tests" class="secondary" type="button">Run public tests</button>
            <button id="final-submit" type="button">Final submit</button>
          </div>
          <p id="status" class="status" role="status" aria-live="polite"></p>
          <p id="score" class="score" aria-live="polite"></p>
        </section>
        <aside class="panel" aria-labelledby="tests-heading">
          <h2 id="tests-heading">Public tests</h2><ul id="public-tests"></ul>
          <h2 style="margin-top:22px">Results</h2><ul id="results"></ul>
        </aside>
      </div>
    </main>
    <script>
      const source = document.querySelector('#source');
      const status = document.querySelector('#status');
      const score = document.querySelector('#score');
      const results = document.querySelector('#results');
      const runPublic = document.querySelector('#run-public-tests');
      const finalSubmit = document.querySelector('#final-submit');
      let content;
      function safeText(value) { return typeof value === 'string' ? value : ''; }
      function renderOutcomes(outcomes) {
        results.replaceChildren(...outcomes.map((outcome) => {
          const item = document.createElement('li');
          item.className = outcome.status === 'passed' ? 'pass' : 'fail';
          item.textContent = outcome.label + ': ' + (outcome.status === 'passed' ? 'Passed' : safeText(outcome.message) || 'Failed');
          return item;
        }));
      }
      function setBusy(busy) { runPublic.disabled = busy; finalSubmit.disabled = busy; }
      async function run(phase) {
        setBusy(true); status.textContent = phase === 'practice' ? 'Running public tests...' : 'Evaluating final submission...';
        try {
          const result = await window.GatewayApp.runCodeSubmission({ source: source.value, phase });
          if (!result.accepted) { throw new Error(result.denial?.message || 'Submission was blocked.'); }
          renderOutcomes(result.publicOutcomes);
          if (phase === 'practice') { status.textContent = 'Public tests finished.'; score.textContent = ''; }
          else { status.textContent = result.hiddenSummary.passed + ' of ' + result.hiddenSummary.total + ' hidden tests passed.'; score.textContent = 'Score: ' + result.scoreGiven + ' / ' + result.scoreMaximum; finalSubmit.disabled = true; }
        } catch (error) { status.textContent = error instanceof Error ? error.message : 'Code run failed.'; }
        finally { if (phase === 'practice') setBusy(false); }
      }
      source.addEventListener('keydown', (event) => { if (event.key !== 'Tab') return; event.preventDefault(); const start = source.selectionStart; const end = source.selectionEnd; source.setRangeText('    ', start, end, 'end'); });
      async function start() {
        if (!window.GatewayApp) throw new Error('Lantern runtime is unavailable.');
        content = await window.GatewayApp.getActivityContent();
        document.title = content.title; document.querySelector('#title').textContent = content.title; document.querySelector('#prompt').textContent = content.prompt;
        source.value = content.starterCode;
        document.querySelector('#public-tests').replaceChildren(...content.publicCases.map((testCase) => { const item = document.createElement('li'); item.textContent = testCase.label; const detail = document.createElement('span'); detail.className = 'test-input'; detail.textContent = 'args: ' + JSON.stringify(testCase.args) + '  expected: ' + JSON.stringify(testCase.expected); item.append(detail); return item; }));
        runPublic.addEventListener('click', () => void run('practice')); finalSubmit.addEventListener('click', () => void run('final'));
      }
      void start().catch((error) => { status.textContent = error instanceof Error ? error.message : 'Assignment could not load.'; });
    </script>
  </body>
</html>`;
