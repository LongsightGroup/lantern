import type { AppWriterContextSelection } from './context.ts';
import { readAppWriterRevisionContext } from './context.ts';
import { createInitializedGenerationPlan } from './generation_plan.ts';
import { buildAppWriterStarterWorkspace } from './starter_workspace.ts';
import type { AppGenerationWorkspaceRecord, AppWriterWorkspaceFile } from './types.ts';
import { LANTERN_APP_CSS_VERSION } from '../styles/lantern_app_css.ts';
import { PICO_CSS_VERSION } from '../styles/pico_css.ts';

const TYPESCRIPT_AUTHORING_SOURCE_PATHS = new Set(['source/app.ts', 'source/content_model.ts']);

export function buildInitializedAppWriterWorkspace(input: {
  generationId: string;
  contextSelection: AppWriterContextSelection;
  initializedAt: string;
  revisionSourceFiles?: readonly AppWriterWorkspaceFile[];
}): AppGenerationWorkspaceRecord {
  const revision = readAppWriterRevisionContext(input.contextSelection.selectedContext);
  const starter = revision === null
    ? buildAppWriterStarterWorkspace(
      input.contextSelection.starterId,
      input.contextSelection.selectedContext.authoringMode,
    )
    : null;
  const sourcePackageFiles = input.revisionSourceFiles ?? starter?.files ?? [];
  const packageFiles = sourcePackageFiles.map(
    (file): AppWriterWorkspaceFile => ({
      ...file,
      role: isTypeScriptAuthoringSourcePath(file.path) ? 'evidence' : 'package',
    }),
  );
  const instructionFiles = buildInstructionFiles({
    instructions: starter?.instructions ??
      buildRevisionInstructions({
        contextSelection: input.contextSelection,
      }),
    contextSelection: input.contextSelection,
  });
  const files = [...instructionFiles, ...packageFiles];

  return {
    generationId: input.generationId,
    selectedStarterId: input.contextSelection.starterId,
    files,
    generationPlan: createInitializedGenerationPlan({
      startedAt: input.initializedAt,
      completedAt: input.initializedAt,
      result: {
        recipeId: input.contextSelection.selectedContext.recipe.recipeId,
        recipeVersion: input.contextSelection.selectedContext.recipe.recipeVersion,
        authoringMode: input.contextSelection.selectedContext.authoringMode,
        starterId: input.contextSelection.starterId,
        initializationMode: revision === null ? 'starter' : 'revision_snapshot',
        ...(revision === null ? {} : {
          sourcePackageVersionId: revision.sourcePackageVersionId,
          sourceAppId: revision.sourceAppId,
          sourceVersion: revision.sourceVersion,
          targetVersion: revision.targetVersion,
        }),
        fileCount: files.length,
      },
    }),
    validationFindings: [],
    repairAttemptCount: 0,
    updatedAt: input.initializedAt,
  };
}

function buildRevisionInstructions(input: { contextSelection: AppWriterContextSelection }): string {
  const revision = readAppWriterRevisionContext(input.contextSelection.selectedContext);

  if (revision === null) {
    throw new Error('Revision instructions require revision context.');
  }

  return `# Lantern App Writer Revision

You are revising an existing Lantern learning app package.

Source package:
- app_id: ${revision.sourceAppId}
- source version: ${revision.sourceVersion}
- target version: ${revision.targetVersion}

Rules:
- Start from the package files already present in this workspace.
- Preserve manifest.json app_id as "${revision.sourceAppId}".
- Set manifest.json version to "${revision.targetVersion}".
- Preserve the existing runtime contract unless the instructor explicitly asks
  for a change that stays inside Lantern's generated app capabilities.
- Do not create backend code, Worker code, Durable Objects, D1/R2 access,
  external network calls, LMS APIs, localStorage, or sessionStorage.
- Use GatewayApp local state for learner progress and GatewayApp attempt events
  for reportable learner actions.
- Keep all package files inside the Lantern allowlist.
- Follow .lantern/contracts/generated-app-contract.md as the app-facing trust
  boundary. The generated app is a reviewed browser activity package, not an
  LMS integration or backend service.
- Keep styling self-contained. Use the vendored Pico base stylesheet and
  Lantern learning-app primitives already present in the package. Do not modify
  dist/pico.min.css or load external fonts, stylesheets, images, or scripts.
- Follow .lantern/contracts/design-contract.md for the app shell, activity
  frame, learner states, responsive behavior, and preview proof.
- Leave AGENTS.md and .lantern/** as instruction/contract files only; they are
  not package artifact files.

Use the real filesystem tools to edit files. Run the revision all the way to the
Definition of Done. If diagnostics are supplied later, repair the same
workspace instead of starting over.
`;
}

function isTypeScriptAuthoringSourcePath(path: string): boolean {
  return TYPESCRIPT_AUTHORING_SOURCE_PATHS.has(path);
}

function buildInstructionFiles(input: {
  instructions: string;
  contextSelection: AppWriterContextSelection;
}): AppWriterWorkspaceFile[] {
  const revision = readAppWriterRevisionContext(input.contextSelection.selectedContext);

  return [
    {
      path: 'AGENTS.md',
      role: 'instruction',
      contents: input.instructions,
    },
    {
      path: '.lantern/contracts/app-writer-recipe.json',
      role: 'contract',
      contents: `${JSON.stringify(input.contextSelection.selectedContext.recipe, null, 2)}\n`,
    },
    {
      path: '.lantern/contracts/prompt-context.json',
      role: 'contract',
      contents: `${
        JSON.stringify(
          {
            referenceAppIds: input.contextSelection.selectedContext.referenceAppIds,
            publicContractSources: input.contextSelection.selectedContext.publicContractSources,
            promptContextVersion: input.contextSelection.selectedContext.promptContextVersion,
            promptContextExcerpts: input.contextSelection.selectedContext.promptContextExcerpts,
            selectionReason: input.contextSelection.selectedContext.selectionReason,
            revision,
          },
          null,
          2,
        )
      }\n`,
    },
    ...(revision === null ? [] : [
      {
        path: '.lantern/contracts/source-package.json',
        role: 'contract' as const,
        contents: `${JSON.stringify(revision, null, 2)}\n`,
      },
    ]),
    {
      path: '.lantern/contracts/generated-app-contract.md',
      role: 'contract',
      contents: buildGeneratedAppContract(),
    },
    {
      path: '.lantern/contracts/gateway-app-sdk.d.ts',
      role: 'contract',
      contents: buildGatewayAppSdkContract(),
    },
    {
      path: '.lantern/contracts/definition-of-done.md',
      role: 'contract',
      contents: buildDefinitionOfDoneContract(),
    },
    {
      path: '.lantern/contracts/validation-contract.md',
      role: 'contract',
      contents: buildValidationContract(),
    },
    {
      path: '.lantern/contracts/style-contract.md',
      role: 'contract',
      contents: buildStyleContract(),
    },
    {
      path: '.lantern/contracts/design-contract.md',
      role: 'contract',
      contents: buildDesignContract(),
    },
  ];
}

function buildGeneratedAppContract(): string {
  return `# Generated App Contract

Contract id: lantern-generated-app-contract@0.1.0

The generated app is a reviewed browser activity package. Lantern owns LMS
launch, identity, storage, grading, runtime delivery, logs, and approval.

## Package Boundary

Required package files:

- manifest.json
- dist/index.html
- dist/pico.min.css
- dist/lantern-app.css
- dist/app.css
- dist/app.js
- content/activity.json
- preview/fixtures.json
- preview/tests.json

Optional package files:

- scoring/rubric.json
- grading/specs/*.js for browser autograder packages
- evidence/example-output.json for browser autograder packages

AGENTS.md, .lantern/contracts/**, source/**, diagnostics, and run evidence are
workspace context, not package artifact files.

## Runtime Boundary

Use only browser code and window.GatewayApp. Generated apps must not receive or
invent raw LMS tokens, LTI logic, direct LMS APIs, direct storage, Cloudflare
bindings, backend services, Worker entrypoints, Durable Objects, arbitrary
outbound network calls, or direct grade writes.

Lantern may implement gateway capabilities with Workers, D1, R2, Dynamic
Workers, Worker Loader, or Durable Objects behind the platform boundary. Those
implementation details do not become generated app capabilities.

## State And Reporting

Use GatewayApp local state for resumable learner progress. Use GatewayApp
attempt events for durable reportable facts. Lantern maps those events into a
small standards-inspired vocabulary: answers become answered question events,
progress becomes progressed checkpoint events, and completion becomes a
completed activity event. Use finalizeAttempt({ completionState: "completed" })
when the activity is done. Instructor reports come from Lantern aggregating
gateway-managed state and attempt events; do not invent a class-wide database.
Do not call SCORM, xAPI, cmi5, LRS, LMS, or grade APIs directly.

## Design And Preview

Use the pinned Pico and Lantern stylesheet stack. Keep app-specific styles in
dist/app.css. Render one focused task-first learning surface, not a landing
page, LMS clone, or dashboard shell. Preview tests must prove the title,
instructions or task, a meaningful interaction or status update, and completion,
report, score, or evidence state when the prompt asks for it.
`;
}

function buildGatewayAppSdkContract(): string {
  return `// Narrowed GatewayApp SDK contract for generated Lantern learning apps.
// Generated apps run in the browser and use only window.GatewayApp. Do not
// import the Lantern SDK and do not call LMS or Cloudflare APIs directly.
type AttemptEvent =
  | {
      type: "answer";
      questionId: string;
      answer: string | string[];
      correct?: boolean;
      scoreGiven?: number;
      scoreMaximum?: number;
      timestamp: string;
    }
  | { type: "progress"; checkpoint: string; value: number; timestamp: string }
  | { type: "complete"; timestamp: string };
type AttemptEventLearningVerb = "answered" | "progressed" | "completed";
type AttemptEventObjectType = "question" | "checkpoint" | "activity";
interface NormalizedAttemptEvent {
  eventType: AttemptEvent["type"];
  learningVerb: AttemptEventLearningVerb;
  objectId: string;
  objectType: AttemptEventObjectType;
  result: Record<string, unknown>;
  timestamp: string;
}

interface GatewayMutationResult { accepted: boolean }
interface LaunchContext {
  userRole: "learner" | "instructor";
  courseId: string;
  assignmentId?: string;
  activityId: string;
  submissionMode: "standard" | "anonymous_submission";
}
interface BrowserGraderResult { scoreGiven: number; scoreMaximum: number }
interface ScoreProposal { scoreGiven: number; scoreMaximum: number }
interface EvidenceArtifactUpload {
  kind: "screenshot_png" | "structured_json";
  contentType: "image/png" | "application/json";
  fileName: string;
  bodyBase64: string;
}
interface GatewayAppClient {
  getLaunchContext?(): Promise<LaunchContext>;
  getActivityContent<T = unknown>(): Promise<T>;
  readLocalState?<T = unknown>(): Promise<T | null>;
  writeLocalState?<T = unknown>(value: T): Promise<GatewayMutationResult>;
  emitAttemptEvent?(event: AttemptEvent): Promise<GatewayMutationResult>;
  submitEvidenceArtifact?(input: EvidenceArtifactUpload): Promise<GatewayMutationResult>;
  submitScoreProposal?(input: ScoreProposal): Promise<GatewayMutationResult>;
  runBrowserGrader?(): Promise<BrowserGraderResult>;
  finalizeAttempt?(input: {
    completionState: "completed" | "abandoned";
    browserGraderResult?: BrowserGraderResult;
  }): Promise<GatewayMutationResult>;
}
declare global {
  interface Window {
    GatewayApp?: GatewayAppClient;
  }
}
export {};
`;
}

function buildDefinitionOfDoneContract(): string {
  return `# Definition Of Done

Every generated app must pass the same proof loop before Lantern saves it:

1. The workspace follows .lantern/contracts/generated-app-contract.md.
2. TypeScript authoring source passes strict typecheck when source files exist.
3. TypeScript compiles to dist/app.js with no imports or package installs.
4. Styling is self-contained: dist/pico.min.css is the pinned Pico base,
   dist/lantern-app.css is the pinned Lantern learning-app layer, and
   app-specific styling lives in dist/app.css.
5. manifest.json, content files, preview fixtures, and preview tests validate.
6. The app boots in Lantern preview without runtime errors.
7. All preview assertions pass.
8. Design contract checks pass: the package keeps the Lantern app shell,
   self-contained styling, semantic controls, visible feedback, and responsive
   iframe-safe layout.
9. Policy checks pass: browser-only package, allowed files only, no external
   network, no LMS APIs, no raw grade passback, no D1/R2/Durable Object/Worker
   code, no localStorage/sessionStorage.
10. Learner progress uses GatewayApp local state and constrained attempt events
   only when the declared capabilities allow it. Do not use SCORM, xAPI, cmi5,
   LRS, direct LMS calls, or arbitrary fetch for learning records.
11. Completion calls use finalizeAttempt({ completionState: "completed" }).
12. Evidence artifacts use submitEvidenceArtifact({
   kind: "structured_json", contentType: "application/json", fileName,
   bodyBase64 }) with bodyBase64 set to btoa(JSON.stringify(data)); never pass
   raw objects like { html, timestamp }.

If Lantern returns diagnostics, repair the workspace and rerun the full proof
loop. Do not hide diagnostics by weakening preview tests or removing required
learning behavior.
`;
}

function buildValidationContract(): string {
  return `# Validation Contract

Package files are the only files that become the reviewed app artifact:

- manifest.json
- dist/index.html
- dist/pico.min.css
- dist/lantern-app.css
- dist/app.js
- dist/app.css
- content/activity.json
- preview/fixtures.json
- preview/tests.json
- grading/** for browser-autograder packages
- evidence/** examples for browser-autograder packages

Instruction, contract, source, and evidence files under AGENTS.md, .lantern/**,
and source/** are available to the workspace harness but are not imported into
the saved reviewed package unless Lantern explicitly promotes compiled output.
`;
}

function buildStyleContract(): string {
  return `# Style Contract

Generated learning apps use a self-contained stylesheet stack:

1. dist/pico.min.css: Pico CSS ${PICO_CSS_VERSION}, pinned by Lantern.
2. dist/lantern-app.css: Lantern learning-app primitives ${LANTERN_APP_CSS_VERSION},
   pinned by Lantern.
3. dist/app.css: app-specific styling written by the model.

Rules:

- Use semantic HTML first: main, section, article, h1-h3, button, fieldset,
  label, table, progress, output, and form controls.
- Use Pico defaults for ordinary typography, buttons, forms, tables, and
  progress elements.
- Use Lantern classes for learning-specific UI: ln-app, ln-panel,
  ln-activity-header, ln-toolbar, ln-flashcard, ln-choice-grid, ln-choice,
  ln-choice-selected, ln-choice-correct, ln-choice-incorrect, ln-feedback,
  ln-feedback-success, ln-feedback-warning, ln-feedback-danger,
  ln-progress-summary, ln-report-table, ln-instructor-panel, and
  ln-visually-hidden.
- Keep app-specific overrides in dist/app.css.
- Do not modify dist/pico.min.css.
- Do not modify dist/lantern-app.css unless Lantern explicitly asks for a
  platform style contract update.
- Do not load external fonts, stylesheets, scripts, images, icons, or CDNs.
- Do not assume Canvas, Moodle, Sakai, Blackboard, or LMS page CSS.
- Support iframe widths from 360px to desktop.
- Preserve visible focus states and readable contrast.
- See .lantern/contracts/design-contract.md for the layout, component, state,
  and preview-proof decisions every generated app must follow.
`;
}

function buildDesignContract(): string {
  return `# Design Contract

Generated Lantern apps are task-first learning tools. They are not landing
pages, dashboards, LMS pages, or general app shells. The design goal is a calm,
clear activity surface that works inside an LMS iframe and makes the next
learning action obvious.

## Required App Shell

- Keep dist/index.html on the reviewed shell:
  <main id="app" class="ln-app" data-test="app-root"></main>.
- Render one h1 on the first usable screen with data-test="app-title".
- Show concise learner instructions near the title.
- Show the current task, current progress, and the next safe action without
  requiring the learner to hunt.
- Use semantic controls: button for actions, fieldset and legend for grouped
  choices, label for inputs, table for reports, progress for numeric progress,
  output or an aria-live region for feedback.
- Do not create a marketing hero, decorative dashboard, nested card layout, or
  LMS-themed page chrome.

## Activity Frames

Choose the smallest frame that matches the instructor prompt:

- Focused practice or flashcards: use .ln-activity-header, .ln-progress-summary,
  article.ln-flashcard, .ln-choice-grid, button.ln-choice, and .ln-feedback.
  Show one focused prompt at a time unless the instructor explicitly asks for a
  review grid.
- Matching or sorting: use fieldset and legend for the task, .ln-match-grid or
  .ln-sort-grid for the working area, and buttons or native form controls for
  all learner moves. Never require drag-only interaction.
- Simulation: keep controls in a labeled form or .ln-toolbar, keep outputs in a
  readable section, and provide text feedback for important state changes. Use
  canvas only when the simulation genuinely needs it and mirror the essential
  state in accessible text.
- Instructor report: use section.ln-instructor-panel, .ln-report-summary, and
  table.ln-report-table. Show only data available through Lantern content,
  local state, attempt events, preview fixtures, or reviewed package data. Do
  not fake class-wide analytics.
- Browser autograder: show instructions, one clear run/check action, score or
  status output, and evidence summary. Keep grading mechanics behind
  GatewayApp.

## Required States

Handle the states the prompt implies:

- Loading: show short text while GatewayApp content or state loads.
- Ready: show the current task and primary action.
- Feedback: after every meaningful answer, update visible feedback with
  .ln-feedback and an output or aria-live region.
- Resume: if local state exists, restore the learner's position and progress.
- Error: show a clear recoverable message if content is missing or malformed.
- Completion: show what was completed before calling finalizeAttempt({
  completionState: "completed" }).

## Responsive And Accessible Defaults

- Work at 360px iframe width without horizontal scrolling.
- Keep tap targets large enough for ordinary touch use.
- Preserve Pico focus rings and visible keyboard focus.
- Do not hide native radios or checkboxes. Let Pico style them.
- Do not rely on color alone for correctness or status.
- Avoid text inside fixed-width containers unless it can wrap cleanly.
- Prefer system fonts through Pico and Lantern; do not load fonts.

## App-Specific CSS

Use dist/app.css only for small app-specific layout adjustments. Do not
globally restyle body, button, input, select, textarea, table, [type=radio], or
[type=checkbox] unless the change is narrowly scoped under a generated app
class and preserves Pico control behavior.

## Preview Proof

preview/tests.json should prove the designed experience, not just package
existence. For every generated app, include assertions for:

- app title
- primary learner task or instructions
- at least one meaningful interaction or status update
- completion state, report state, or score/status state when the prompt asks
  for completion, reporting, or grading

Use stable data-test selectors for these proof points.
`;
}
