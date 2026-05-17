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
  const starter =
    revision === null
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
    instructions:
      starter?.instructions ??
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
        ...(revision === null
          ? {}
          : {
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
- Keep styling self-contained. Use the vendored Pico base stylesheet and
  Lantern learning-app primitives already present in the package. Do not modify
  dist/pico.min.css or load external fonts, stylesheets, images, or scripts.
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
      contents: `${JSON.stringify(
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
      )}\n`,
    },
    ...(revision === null
      ? []
      : [
          {
            path: '.lantern/contracts/source-package.json',
            role: 'contract' as const,
            contents: `${JSON.stringify(revision, null, 2)}\n`,
          },
        ]),
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
  ];
}

function buildGatewayAppSdkContract(): string {
  return `// Narrowed GatewayApp SDK contract for generated Lantern learning apps.
// Generated apps run in the browser and use only window.GatewayApp. Do not
// import the Lantern SDK and do not call LMS or Cloudflare APIs directly.
type AttemptEvent =
  | { type: "answer"; questionId: string; answer: string | string[]; timestamp: string }
  | { type: "progress"; checkpoint: string; value: number; timestamp: string }
  | { type: "complete"; timestamp: string };

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
  finalizeAttempt?(input?: {
    completionState?: "completed" | "abandoned";
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

1. TypeScript authoring source passes strict typecheck when source files exist.
2. TypeScript compiles to dist/app.js with no imports or package installs.
3. Styling is self-contained: dist/pico.min.css is the pinned Pico base,
   dist/lantern-app.css is the pinned Lantern learning-app layer, and
   app-specific styling lives in dist/app.css.
4. manifest.json, content files, preview fixtures, and preview tests validate.
5. The app boots in Lantern preview without runtime errors.
6. All preview assertions pass.
7. Policy checks pass: browser-only package, allowed files only, no external
   network, no LMS APIs, no raw grade passback, no D1/R2/Durable Object/Worker
   code, no localStorage/sessionStorage.
8. Learner progress uses GatewayApp local state and attempt events only when the
   declared capabilities allow it.
9. Completion calls use finalizeAttempt({ completionState: "completed" }).
10. Evidence artifacts use submitEvidenceArtifact({
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
- dist/app.css when needed
- content/**
- preview/**
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
`;
}
