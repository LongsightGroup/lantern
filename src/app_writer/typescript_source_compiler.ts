import ts from 'https://esm.sh/typescript@5.9.3?bundle';
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
const TYPESCRIPT_LIBRARY_BASE_URL = 'https://esm.sh/typescript@5.9.3/lib/';
const TYPESCRIPT_ROOT_LIBRARY_FILES = ['lib.es2022.d.ts', 'lib.dom.d.ts'] as const;
const TYPESCRIPT_LIBRARY_REFERENCE_PATTERN = /\/\/\/\s*<reference\s+lib="([^"]+)"/g;

let compilerLibraryFilesPromise: Promise<ReadonlyMap<string, string>> | null = null;

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
  const diagnostics = collectTypeScriptDiagnostics(sourceFiles, await loadCompilerLibraryFiles());

  if (diagnostics.length > 0) {
    return {
      files: [...normalizedFiles.values()],
      notes: [],
      validationFindings: diagnostics,
    };
  }

  const output = ts.transpileModule(sourceApp.contents, {
    compilerOptions: compilerOptions(),
    fileName: SOURCE_APP_PATH,
    reportDiagnostics: false,
  });
  const compiledFiles = [...normalizedFiles.values()].filter(
    (file) => !file.path.startsWith('source/') && file.path !== DIST_APP_PATH,
  );

  return {
    files: [
      ...compiledFiles,
      {
        path: DIST_APP_PATH,
        contents: `${output.outputText.trim()}\n`,
      },
    ],
    notes: ['Compiled TypeScript authoring source to reviewed browser JavaScript.'],
    validationFindings: [],
  };
}

function collectTypeScriptDiagnostics(
  sourceFiles: ReadonlyMap<string, string>,
  libraryFiles: ReadonlyMap<string, string>,
): AppGenerationValidationFinding[] {
  const defaultHost = ts.createCompilerHost(compilerOptions(), true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists(fileName) {
      return (
        sourceFiles.has(normalizeWorkspacePath(fileName)) ||
        libraryFiles.has(normalizeLibraryPath(fileName)) ||
        defaultHost.fileExists(fileName)
      );
    },
    readFile(fileName) {
      return (
        sourceFiles.get(normalizeWorkspacePath(fileName)) ??
        libraryFiles.get(normalizeLibraryPath(fileName)) ??
        defaultHost.readFile(fileName)
      );
    },
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      const normalized = normalizeWorkspacePath(fileName);
      const sourceText = sourceFiles.get(normalized);

      if (sourceText !== undefined) {
        return ts.createSourceFile(fileName, sourceText, languageVersion, true);
      }

      const libraryText = libraryFiles.get(normalizeLibraryPath(fileName));

      if (libraryText !== undefined) {
        return ts.createSourceFile(fileName, libraryText, languageVersion, true);
      }

      return defaultHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    },
    getDefaultLibLocation() {
      return '/';
    },
    writeFile() {},
  };
  const program = ts.createProgram(
    [SOURCE_APP_PATH, SOURCE_CONTENT_MODEL_PATH, GENERATED_SDK_DECLARATION_PATH],
    compilerOptions(),
    host,
  );

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(mapDiagnosticToFinding);
}

async function loadCompilerLibraryFiles(): Promise<ReadonlyMap<string, string>> {
  if (compilerLibraryFilesPromise === null) {
    compilerLibraryFilesPromise = fetchCompilerLibraryFiles();
  }

  return await compilerLibraryFilesPromise;
}

async function fetchCompilerLibraryFiles(): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  const pending: string[] = [...TYPESCRIPT_ROOT_LIBRARY_FILES];

  for (let index = 0; index < pending.length; index += 1) {
    const fileName = pending[index];

    if (fileName === undefined || files.has(fileName)) {
      continue;
    }

    const contents = await fetchCompilerLibraryFile(fileName);
    files.set(fileName, contents);

    for (const referencedFile of listReferencedLibraryFiles(contents)) {
      if (!files.has(referencedFile) && !pending.includes(referencedFile)) {
        pending.push(referencedFile);
      }
    }
  }

  return files;
}

async function fetchCompilerLibraryFile(fileName: string): Promise<string> {
  const response = await fetch(`${TYPESCRIPT_LIBRARY_BASE_URL}${fileName}`);

  if (!response.ok) {
    throw new Error(
      `Lantern TypeScript compiler could not load ${fileName}: ${response.status} ${response.statusText}.`,
    );
  }

  return await response.text();
}

function listReferencedLibraryFiles(contents: string): string[] {
  return [...contents.matchAll(TYPESCRIPT_LIBRARY_REFERENCE_PATTERN)].map(
    (match) => `lib.${match[1]}.d.ts`,
  );
}

function mapDiagnosticToFinding(diagnostic: ts.Diagnostic): AppGenerationValidationFinding {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const file = diagnostic.file?.fileName ?? null;
  const position =
    diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;

  return {
    code: 'typescript_diagnostic',
    severity: 'error',
    message,
    file,
    field: null,
    fix: 'Repair the generated TypeScript source so it passes strict Lantern typecheck.',
    detail: {
      code: diagnostic.code,
      line: position === null ? null : position.line + 1,
      column: position === null ? null : position.character + 1,
    },
  };
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
      ? '    finalizeAttempt(input?: { completionState?: "completed" | "abandoned" }): Promise<GatewayMutationResult>;'
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
  | { type: "answer"; questionId: string; answer: string | string[]; timestamp: string }
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

function compilerOptions(): ts.CompilerOptions {
  return {
    strict: true,
    noImplicitAny: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    skipLibCheck: true,
    noEmitOnError: true,
  };
}

function normalizeWorkspacePath(path: string): string {
  return path
    .trim()
    .replaceAll(/^\/+|\/+$/g, '')
    .replaceAll(/\/+/g, '/');
}

function normalizeLibraryPath(path: string): string {
  return normalizeWorkspacePath(path).split('/').at(-1) ?? '';
}
