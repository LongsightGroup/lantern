import type {
  AppWriterAuthoringMode,
  AppWriterStarterId,
  AppWriterWorkspaceFile,
} from './types.ts';

export const APP_WRITER_BASELINE_PACKAGE_FILES = [
  'manifest.json',
  'dist/index.html',
  'dist/app.js',
  'content/activity.json',
  'preview/fixtures.json',
  'preview/tests.json',
] as const;

export const APP_WRITER_TYPESCRIPT_AUTHORING_FILES = [
  'manifest.json',
  'dist/index.html',
  'source/app.ts',
  'source/content_model.ts',
  'content/activity.json',
  'preview/fixtures.json',
  'preview/tests.json',
] as const;

export interface AppWriterStarterWorkspace {
  starterId: AppWriterStarterId;
  instructions: string;
  files: AppWriterWorkspaceFile[];
}

export function buildAppWriterStarterWorkspace(
  starterId: AppWriterStarterId,
  authoringMode: AppWriterAuthoringMode = 'javascript',
): AppWriterStarterWorkspace {
  switch (starterId) {
    case 'browser-autograder':
      return {
        starterId,
        instructions: buildWorkspaceInstructions(authoringMode),
        files: buildStarterFilesForAuthoringMode(
          buildBrowserAutograderStarterFiles(),
          authoringMode,
        ),
      };
    case 'simple-activity':
      return {
        starterId,
        instructions: buildWorkspaceInstructions(authoringMode),
        files: buildStarterFilesForAuthoringMode(buildSimpleActivityStarterFiles(), authoringMode),
      };
  }
}

export function applyWorkspaceFileEdits(input: {
  baseFiles: readonly AppWriterWorkspaceFile[];
  fileEdits: readonly AppWriterWorkspaceFile[];
}): AppWriterWorkspaceFile[] {
  const files = new Map(input.baseFiles.map((file) => [file.path, file]));

  for (const file of input.fileEdits) {
    const existingFile = files.get(file.path);
    const role = file.role ?? existingFile?.role;
    files.set(file.path, {
      path: file.path,
      contents: file.contents,
      ...(role === undefined ? {} : { role }),
    });
  }

  return [...files.values()];
}

export function validateBaselineFileEdits(
  fileEdits: readonly AppWriterWorkspaceFile[],
  authoringMode: AppWriterAuthoringMode = 'javascript',
): string[] {
  const editedPaths = new Set(fileEdits.map((file) => file.path));
  const requiredPaths =
    authoringMode === 'typescript'
      ? APP_WRITER_TYPESCRIPT_AUTHORING_FILES
      : APP_WRITER_BASELINE_PACKAGE_FILES;

  return requiredPaths.filter((path) => !editedPaths.has(path));
}

function buildWorkspaceInstructions(authoringMode: AppWriterAuthoringMode): string {
  return `# Lantern Generated App Workspace

You are editing a Lantern learning app package inside a constrained virtual
workspace.

Rules:
- Write only files requested by Lantern.
- Keep the app browser-only.
- Use window.GatewayApp as the only runtime API.
- In TypeScript, guard window.GatewayApp before using it:
  const gateway = window.GatewayApp;
  if (!gateway) throw new Error("Lantern injects window.GatewayApp.");
- Put learner content in content/activity.json.
- ${
    authoringMode === 'typescript'
      ? 'Put typed app source in source/app.ts and content types in source/content_model.ts. Lantern compiles source/app.ts into dist/app.js.'
      : 'Put browser-ready JavaScript in dist/app.js.'
  }
- Do not use imports, package installs, external URLs, localStorage, sessionStorage, LMS APIs, Cloudflare bindings, D1, R2, Durable Objects, or raw grade passback.
- Use stable data-test selectors for preview tests.
- Emit GatewayApp attempt events for reportable learner actions.
- Attempt event shapes are strict: answer events have questionId and answer,
  progress events have checkpoint and numeric value, complete events have only
  type and timestamp.
- Use GatewayApp local state for resumable per-student progress when the plan declares it.

Definition of Done:
- The workspace must pass Lantern's strict TypeScript check when source files are present.
- The package manifest, content, preview fixtures, preview tests, SDK capability use, and policy checks must validate with zero error findings.
- The app must boot and pass preview assertions in Lantern's runtime path.
- If any typing, validation, preview, runtime, or policy check fails, Lantern will send diagnostics back for targeted repair and rerun the full loop.
`;
}

function buildStarterFilesForAuthoringMode(
  files: AppWriterWorkspaceFile[],
  authoringMode: AppWriterAuthoringMode,
): AppWriterWorkspaceFile[] {
  if (authoringMode === 'javascript') {
    return files;
  }

  return [
    ...files.filter((file) => file.path !== 'dist/app.js'),
    {
      path: 'source/content_model.ts',
      contents: 'interface ActivityContent {\n  title: string;\n  instructions: string;\n}\n',
    },
    {
      path: 'source/app.ts',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern injects window.GatewayApp.");\n  const content = await gateway.getActivityContent<ActivityContent>();\n  const root = document.querySelector("#app");\n  if (!(root instanceof HTMLElement)) throw new Error("App root is missing.");\n  root.innerHTML = "";\n  const title = document.createElement("h1");\n  title.dataset.test = "app-title";\n  title.textContent = content.title;\n  root.append(title);\n}\nvoid start();\n',
    },
  ];
}

function buildSimpleActivityStarterFiles(): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'manifest.json',
      contents: formatJson({
        schema_version: '1',
        app_id: 'starter-simple-activity',
        version: '0.1.0',
        title: 'Starter Simple Activity',
        owner: {
          type: 'user',
          id: 'instructor',
        },
        entrypoint: '/dist/index.html',
        roles: ['learner', 'instructor'],
        install_scope: 'course',
        capabilities: ['read_activity_content'],
        grading: {
          mode: 'completion',
          max_score: 100,
        },
        content_files: ['/content/activity.json'],
        preview: {
          fixtures_file: '/preview/fixtures.json',
          tests_file: '/preview/tests.json',
        },
      }),
    },
    {
      path: 'dist/index.html',
      contents:
        '<!doctype html><html><head><meta charset="utf-8"><title>Starter Simple Activity</title><link rel="stylesheet" href="./app.css"></head><body><main id="app" data-test="app-root"></main><script src="./app.js"></script></body></html>\n',
    },
    {
      path: 'dist/app.js',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern injects window.GatewayApp.");\n  const content = await gateway.getActivityContent();\n  const root = document.querySelector("#app");\n  if (!root) throw new Error("App root is missing.");\n  root.innerHTML = `<h1 data-test="app-title">${content.title ?? "Learning Activity"}</h1>`;\n}\nvoid start();\n',
    },
    {
      path: 'dist/app.css',
      contents:
        ':root { color-scheme: light; } body { margin: 0; font-family: system-ui, sans-serif; background: #f7f8fa; color: #18202f; } main { max-width: 880px; margin: 0 auto; padding: 32px 20px; }\n',
    },
    {
      path: 'content/activity.json',
      contents: formatJson({
        title: 'Starter Simple Activity',
        instructions: 'Replace this content with the instructor-requested learning activity.',
      }),
    },
    {
      path: 'preview/fixtures.json',
      contents: formatJson({
        launch: {
          user_role: 'learner',
          course_id: 'course-1',
          assignment_id: null,
          activity_id: 'starter-simple-activity',
        },
        attempt_id: 'attempt-1',
        local_state: null,
      }),
    },
    {
      path: 'preview/tests.json',
      contents: formatJson([
        {
          name: 'renders title',
          assert: {
            selector: '[data-test="app-title"]',
            text: 'Starter Simple Activity',
          },
        },
      ]),
    },
  ];
}

function buildBrowserAutograderStarterFiles(): AppWriterWorkspaceFile[] {
  return [
    {
      path: 'manifest.json',
      contents: formatJson({
        schema_version: '1',
        app_id: 'starter-browser-autograder',
        version: '0.1.0',
        title: 'Starter Browser Autograder',
        owner: {
          type: 'user',
          id: 'instructor',
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
          grader_spec_files: ['/grading/specs/checks.spec.js'],
          evidence_example_file: '/evidence/example-output.json',
        },
      }),
    },
    {
      path: 'dist/index.html',
      contents:
        '<!doctype html><html><head><meta charset="utf-8"><title>Starter Browser Autograder</title></head><body><main id="app" data-test="app-root"></main><script src="./app.js"></script></body></html>\n',
    },
    {
      path: 'dist/app.js',
      contents:
        'async function start() {\n  const gateway = window.GatewayApp;\n  if (!gateway) throw new Error("Lantern injects window.GatewayApp.");\n  const content = await gateway.getActivityContent();\n  const root = document.querySelector("#app");\n  if (!root) throw new Error("App root is missing.");\n  root.innerHTML = `<h1 data-test="app-title">${content.title ?? "Browser Autograder"}</h1><p data-test="score">Waiting</p>`;\n}\nvoid start();\n',
    },
    {
      path: 'content/activity.json',
      contents: formatJson({
        title: 'Starter Browser Autograder',
        instructions: 'Replace this content with the reviewed browser-checking task.',
      }),
    },
    {
      path: 'preview/fixtures.json',
      contents: formatJson({
        launch: {
          user_role: 'learner',
          course_id: 'course-1',
          assignment_id: null,
          activity_id: 'starter-browser-autograder',
        },
        attempt_id: 'attempt-1',
        local_state: null,
      }),
    },
    {
      path: 'preview/tests.json',
      contents: formatJson([
        {
          name: 'renders title',
          assert: {
            selector: '[data-test="app-title"]',
            text: 'Starter Browser Autograder',
          },
        },
      ]),
    },
    {
      path: 'grading/specs/checks.spec.js',
      contents:
        'describe("submitted page", () => { it("has visible content", () => { expect(document.body.textContent?.trim().length).toBeGreaterThan(0); }); });\n',
    },
    {
      path: 'evidence/example-output.json',
      contents: formatJson({
        url: 'about:blank',
        checks: [],
      }),
    },
  ];
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
