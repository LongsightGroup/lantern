import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AppGenerationPlan,
  AppGenerationValidationFinding,
  AppPackageSourceCompiler,
  AppWriterWorkspaceFile,
} from './types.ts';

const SOURCE_APP_PATH = 'source/app.ts';
const SOURCE_CONTENT_MODEL_PATH = 'source/content_model.ts';
const GENERATED_SDK_DECLARATION_PATH = 'source/lantern-sdk.d.ts';
const DIST_APP_PATH = 'dist/app.js';
export function createTypeScriptAppPackageSourceCompiler(): AppPackageSourceCompiler {
  return {
    supportsTypeScriptAuthoring: true,
    async compile(input) {
      return await compileTypeScriptWorkspace(input.appPlan, input.files);
    },
  };
}

async function compileTypeScriptWorkspace(
  appPlan: AppGenerationPlan,
  files: readonly AppWriterWorkspaceFile[],
): Promise<{
  files: AppWriterWorkspaceFile[];
  validationFindings: AppGenerationValidationFinding[];
  notes: string[];
}> {
  const normalizedFiles = new Map(
    files.map((file) => [
      normalizeWorkspacePath(file.path),
      { ...file, path: normalizeWorkspacePath(file.path) },
    ]),
  );
  const sourceApp = normalizedFiles.get(SOURCE_APP_PATH);
  const contentModel = normalizedFiles.get(SOURCE_CONTENT_MODEL_PATH);

  if (!sourceApp || !contentModel) {
    return {
      files: [...normalizedFiles.values()],
      notes: [],
      validationFindings: [buildMissingSourceFinding(sourceApp, contentModel)],
    };
  }

  const importFinding =
    findForbiddenModuleSyntax(sourceApp) ?? findForbiddenModuleSyntax(contentModel);

  if (importFinding !== null) {
    return {
      files: [...normalizedFiles.values()],
      notes: [],
      validationFindings: [importFinding],
    };
  }

  const sourceFiles = new Map<string, string>([
    [SOURCE_APP_PATH, sourceApp.contents],
    [SOURCE_CONTENT_MODEL_PATH, contentModel.contents],
    [GENERATED_SDK_DECLARATION_PATH, buildSdkDeclaration(appPlan)],
  ]);
  const compilation = await compileSourceFiles(sourceFiles);
  if (compilation.validationFindings.length > 0) {
    return {
      files: [...normalizedFiles.values()],
      notes: [],
      validationFindings: compilation.validationFindings,
    };
  }
  const compiledFiles = [...normalizedFiles.values()].filter(
    (file) => !file.path.startsWith('source/') && file.path !== DIST_APP_PATH,
  );

  return {
    files: [
      ...compiledFiles,
      {
        path: DIST_APP_PATH,
        contents: `${compilation.outputText.trim()}\n`,
      },
    ],
    notes: ['Compiled TypeScript authoring source to reviewed browser JavaScript.'],
    validationFindings: [],
  };
}

/** Runs the installed TypeScript 7 compiler with an isolated, explicit source set. */
async function compileSourceFiles(sourceFiles: ReadonlyMap<string, string>): Promise<{
  outputText: string;
  validationFindings: AppGenerationValidationFinding[];
}> {
  const root = await mkdtemp(join(tmpdir(), 'lantern-typescript-'));
  try {
    await mkdir(join(root, 'source'));
    for (const [path, contents] of sourceFiles) {
      await writeFile(join(root, path), contents);
    }
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          target: 'ES2022',
          module: 'ES2022',
          lib: ['ES2022', 'DOM'],
          types: [],
          noEmitOnError: true,
          rootDir: 'source',
          outDir: 'dist',
        },
        files: [...sourceFiles.keys()],
      }),
    );
    const compilerPath = fileURLToPath(
      new URL('./bin/tsc', import.meta.resolve('typescript/package.json')),
    );
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [compilerPath, '--project', join(root, 'tsconfig.json'), '--pretty', 'false'],
        {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    });
    if (result.code !== 0) {
      const validationFindings = [
        ...result.output.matchAll(/^(?:(.+)\((\d+),(\d+)\): )?error TS(\d+): (.+)$/gm),
      ].map((match) => ({
        code: 'typescript_diagnostic',
        severity: 'error' as const,
        message: match[5] ?? '',
        file:
          match[1]?.match(/(?:^|\/)source\/[^/]+$/)?.[0]?.replace(/^\//, '') ?? match[1] ?? null,
        field: null,
        fix: 'Repair the generated TypeScript source so it passes strict Lantern typecheck.',
        detail: {
          code: Number(match[4]),
          line: match[2] === undefined ? null : Number(match[2]),
          column: match[3] === undefined ? null : Number(match[3]),
        },
      }));
      if (validationFindings.length === 0) {
        throw new Error(`Lantern TypeScript compiler failed: ${result.output.trim()}`);
      }
      return { outputText: '', validationFindings };
    }
    return {
      outputText: await readFile(join(root, 'dist/app.js'), 'utf8'),
      validationFindings: [],
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function buildMissingSourceFinding(
  sourceApp: AppWriterWorkspaceFile | undefined,
  contentModel: AppWriterWorkspaceFile | undefined,
): AppGenerationValidationFinding {
  const missingFiles = [
    sourceApp ? null : SOURCE_APP_PATH,
    contentModel ? null : SOURCE_CONTENT_MODEL_PATH,
  ].filter((path): path is string => path !== null);

  return {
    code: 'typescript_source_missing',
    severity: 'error',
    message: `TypeScript authoring mode requires ${missingFiles.join(' and ')}.`,
    file: null,
    field: null,
    fix: 'Return source/app.ts and source/content_model.ts so Lantern can typecheck and compile the app.',
    detail: {
      missingFiles,
    },
  };
}

function findForbiddenModuleSyntax(
  file: AppWriterWorkspaceFile,
): AppGenerationValidationFinding | null {
  if (!/(^|\n)\s*(?:import|export)\s/m.test(file.contents)) {
    return null;
  }

  return {
    code: 'typescript_module_syntax_forbidden',
    severity: 'error',
    message: `${file.path} must not use module imports or exports in TypeScript authoring mode.`,
    file: file.path,
    field: null,
    fix: 'Use global type declarations in source/content_model.ts and plain script code in source/app.ts.',
    detail: {},
  };
}

function buildSdkDeclaration(appPlan: AppGenerationPlan): string {
  const methods = [
    appPlan.capabilities.includes('read_launch_context')
      ? '    getLaunchContext(): Promise<LaunchContext>;'
      : null,
    appPlan.capabilities.includes('read_activity_content')
      ? '    getActivityContent<T = ActivityContent>(): Promise<T>;'
      : null,
    appPlan.capabilities.includes('read_local_state')
      ? '    readLocalState<T = unknown>(): Promise<T | null>;'
      : null,
    appPlan.capabilities.includes('write_local_state')
      ? '    writeLocalState<T = unknown>(value: T): Promise<GatewayMutationResult>;'
      : null,
    appPlan.capabilities.includes('submit_attempt_event')
      ? '    emitAttemptEvent(event: AttemptEvent): Promise<GatewayMutationResult>;'
      : null,
    appPlan.capabilities.includes('submit_evidence_artifact')
      ? '    submitEvidenceArtifact(input: EvidenceArtifactUpload): Promise<GatewayMutationResult>;'
      : null,
    appPlan.capabilities.includes('finalize_attempt')
      ? '    finalizeAttempt(input: { completionState: "completed" | "abandoned"; browserGraderResult?: BrowserGraderResult }): Promise<GatewayMutationResult>;'
      : null,
    appPlan.capabilities.includes('finalize_attempt')
      ? '    runBrowserGrader(): Promise<BrowserGraderResult>;'
      : null,
    appPlan.capabilities.includes('finalize_attempt')
      ? '    submitScoreProposal(input: ScoreProposal): Promise<GatewayMutationResult>;'
      : null,
  ].filter((line): line is string => line !== null);

  return `type UserRole = "learner" | "instructor";
interface LaunchContext {
  userRole: UserRole;
  courseId: string;
  assignmentId?: string;
  activityId: string;
  submissionMode: "standard" | "anonymous_submission";
}
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
interface GatewayMutationResult { accepted: boolean }
interface ScoreProposal { scoreGiven: number; scoreMaximum: number }
interface BrowserGraderResult { scoreGiven: number; scoreMaximum: number }
interface EvidenceArtifactUpload {
  kind: "screenshot_png" | "structured_json";
  contentType: "image/png" | "application/json";
  fileName: string;
  bodyBase64: string;
}
interface GatewayAppClient {
${methods.join('\n')}
}
declare global {
  interface Window {
    GatewayApp?: GatewayAppClient;
  }
}
export {};
`;
}

function normalizeWorkspacePath(path: string): string {
  return path
    .trim()
    .replaceAll(/^\/+|\/+$/g, '')
    .replaceAll(/\/+/g, '/');
}
