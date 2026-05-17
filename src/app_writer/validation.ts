import type { Capability } from '../../sdk/app-sdk.ts';
import { preflightLocalAppPackageSource } from '../authoring/local_app.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type {
  AppGenerationPlan,
  AppGenerationValidationFinding,
  AppWriterStarterId,
  AppWriterWorkspaceFile,
} from './types.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';
import { LANTERN_APP_CSS } from '../styles/lantern_app_css.ts';
import { PICO_CSS } from '../styles/pico_css.ts';

const REQUIRED_BASELINE_FILES = [
  'manifest.json',
  'dist/index.html',
  'dist/pico.min.css',
  'dist/lantern-app.css',
  'dist/app.css',
  'dist/app.js',
  'content/activity.json',
  'preview/fixtures.json',
  'preview/tests.json',
] as const;

const PINNED_STYLE_FILES: Readonly<Record<string, string>> = {
  'dist/pico.min.css': PICO_CSS,
  'dist/lantern-app.css': LANTERN_APP_CSS,
};

const GATEWAY_METHOD_CAPABILITIES: Readonly<Record<string, Capability>> = {
  getLaunchContext: 'read_launch_context',
  getActivityContent: 'read_activity_content',
  readLocalState: 'read_local_state',
  writeLocalState: 'write_local_state',
  emitAttemptEvent: 'submit_attempt_event',
  submitEvidenceArtifact: 'submit_evidence_artifact',
  submitScoreProposal: 'finalize_attempt',
  runBrowserGrader: 'finalize_attempt',
  finalizeAttempt: 'finalize_attempt',
};

export async function validateGeneratedAppPackage(input: {
  selectedStarterId: AppWriterStarterId;
  files: readonly AppWriterWorkspaceFile[];
}): Promise<AppGenerationValidationFinding[]> {
  const findings: AppGenerationValidationFinding[] = [];
  const normalizedFiles = normalizeWorkspaceFiles(
    selectPackageWorkspaceFiles(input.files),
    findings,
  );

  findings.push(...validateRequiredFiles(normalizedFiles));
  findings.push(...validateAllowedPaths(input.selectedStarterId, normalizedFiles));
  findings.push(...validatePinnedStyleFiles(normalizedFiles));
  findings.push(...validateStaticPolicy(normalizedFiles));
  findings.push(...validateSdkCapabilities(normalizedFiles));

  if (findings.some((finding) => finding.severity === 'error')) {
    return findings;
  }

  const source = createMemoryPackageSource(
    [...normalizedFiles.values()].map((file) => ({
      relativePath: file.path,
      bytes: file.contents,
    })),
  );
  const preflight = await preflightLocalAppPackageSource(source);

  if (!preflight.ok) {
    findings.push(
      ...preflight.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: 'error' as const,
        message: diagnostic.message,
        file: diagnostic.file ?? null,
        field: diagnostic.field ?? null,
        fix: diagnostic.fix,
        detail: {},
      })),
    );
  }

  return findings;
}

function validatePinnedStyleFiles(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const findings: AppGenerationValidationFinding[] = [];

  for (const [path, expectedContents] of Object.entries(PINNED_STYLE_FILES)) {
    const file = files.get(path);

    if (file === undefined || file.contents === expectedContents) {
      continue;
    }

    findings.push({
      code: 'pinned_style_file_modified',
      severity: 'error',
      message: `${path} is a Lantern-owned reviewed stylesheet and must not be modified.`,
      file: path,
      field: null,
      fix: `Restore ${path} to the pinned Lantern-provided stylesheet and put app-specific styles in dist/app.css.`,
      detail: {},
    });
  }

  return findings;
}

export function validateGeneratedAppPackagePlanAlignment(input: {
  appPlan: AppGenerationPlan;
  files: readonly AppWriterWorkspaceFile[];
}): AppGenerationValidationFinding[] {
  const manifestFile = selectPackageWorkspaceFiles(input.files).find(
    (file) => file.path === 'manifest.json',
  );

  if (manifestFile === undefined) {
    return [];
  }

  let manifest: {
    app_id?: unknown;
    title?: unknown;
    capabilities?: unknown;
    grading?: {
      mode?: unknown;
      max_score?: unknown;
    };
  };

  try {
    manifest = JSON.parse(manifestFile.contents) as typeof manifest;
  } catch {
    return [];
  }

  const findings: AppGenerationValidationFinding[] = [];

  if (manifest.app_id !== input.appPlan.appId) {
    findings.push({
      code: 'manifest_plan_app_id_mismatch',
      severity: 'error',
      message: `Generated manifest app_id must match planned app id ${input.appPlan.appId}.`,
      file: 'manifest.json',
      field: '/app_id',
      fix: `Set manifest app_id to ${input.appPlan.appId}.`,
      detail: {
        expected: input.appPlan.appId,
        actual: typeof manifest.app_id === 'string' ? manifest.app_id : null,
      },
    });
  }

  if (manifest.title !== input.appPlan.title) {
    findings.push({
      code: 'manifest_plan_title_mismatch',
      severity: 'error',
      message: `Generated manifest title must match planned title ${input.appPlan.title}.`,
      file: 'manifest.json',
      field: '/title',
      fix: `Set manifest title to ${input.appPlan.title}.`,
      detail: {
        expected: input.appPlan.title,
        actual: typeof manifest.title === 'string' ? manifest.title : null,
      },
    });
  }

  if (manifest.grading?.mode !== input.appPlan.grading.mode) {
    findings.push({
      code: 'manifest_plan_grading_mode_mismatch',
      severity: 'error',
      message: `Generated manifest grading mode must match planned mode ${input.appPlan.grading.mode}.`,
      file: 'manifest.json',
      field: '/grading/mode',
      fix: `Set manifest grading.mode to ${input.appPlan.grading.mode}.`,
      detail: {
        expected: input.appPlan.grading.mode,
        actual: typeof manifest.grading?.mode === 'string' ? manifest.grading.mode : null,
      },
    });
  }

  if (manifest.grading?.max_score !== input.appPlan.grading.maxScore) {
    findings.push({
      code: 'manifest_plan_max_score_mismatch',
      severity: 'error',
      message: `Generated manifest max score must match planned max score ${input.appPlan.grading.maxScore}.`,
      file: 'manifest.json',
      field: '/grading/max_score',
      fix: `Set manifest grading.max_score to ${input.appPlan.grading.maxScore}.`,
      detail: {
        expected: input.appPlan.grading.maxScore,
        actual: typeof manifest.grading?.max_score === 'number' ? manifest.grading.max_score : null,
      },
    });
  }

  findings.push(...validateManifestCapabilitiesMatchPlan(manifest.capabilities, input.appPlan));

  return findings;
}

function normalizeWorkspaceFiles(
  files: readonly AppWriterWorkspaceFile[],
  findings: AppGenerationValidationFinding[],
): Map<string, AppWriterWorkspaceFile> {
  const normalizedFiles = new Map<string, AppWriterWorkspaceFile>();

  for (const file of files) {
    const normalizedPath = normalizeGeneratedPath(file.path);

    if (normalizedPath === null) {
      findings.push({
        code: 'file_path_invalid',
        severity: 'error',
        message: `Generated file path ${file.path} must stay inside the virtual workspace.`,
        file: file.path,
        field: null,
        fix: 'Use a relative package path without leading slash, backslash, or parent-directory segments.',
        detail: {},
      });
      continue;
    }

    if (normalizedFiles.has(normalizedPath)) {
      findings.push({
        code: 'file_path_duplicate',
        severity: 'error',
        message: `Generated file path ${normalizedPath} appears more than once.`,
        file: normalizedPath,
        field: null,
        fix: 'Return each package file at most once.',
        detail: {},
      });
      continue;
    }

    normalizedFiles.set(normalizedPath, {
      path: normalizedPath,
      contents: file.contents,
    });
  }

  return normalizedFiles;
}

function validateManifestCapabilitiesMatchPlan(
  manifestCapabilities: unknown,
  appPlan: AppGenerationPlan,
): AppGenerationValidationFinding[] {
  if (!Array.isArray(manifestCapabilities)) {
    return [];
  }

  const plannedCapabilities = new Set(appPlan.capabilities);
  const declaredCapabilities = new Set(
    manifestCapabilities.filter(
      (capability): capability is Capability => typeof capability === 'string',
    ),
  );
  const findings: AppGenerationValidationFinding[] = [];

  for (const capability of plannedCapabilities) {
    if (declaredCapabilities.has(capability)) {
      continue;
    }

    findings.push({
      code: 'manifest_plan_capability_missing',
      severity: 'error',
      message: `Generated manifest must include planned capability ${capability}.`,
      file: 'manifest.json',
      field: '/capabilities',
      fix: `Add ${capability} to manifest capabilities.`,
      detail: {
        capability,
      },
    });
  }

  for (const capability of declaredCapabilities) {
    if (plannedCapabilities.has(capability)) {
      continue;
    }

    findings.push({
      code: 'manifest_plan_capability_extra',
      severity: 'error',
      message: `Generated manifest declares unplanned capability ${capability}.`,
      file: 'manifest.json',
      field: '/capabilities',
      fix: `Remove ${capability} from manifest capabilities or repair the app plan before writing files.`,
      detail: {
        capability,
      },
    });
  }

  return findings;
}

function validateRequiredFiles(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  return REQUIRED_BASELINE_FILES.flatMap((path) => {
    if (files.has(path)) {
      return [];
    }

    return [
      {
        code: 'required_file_missing',
        severity: 'error' as const,
        message: `Generated package must include ${path}.`,
        file: path,
        field: null,
        fix: `Add ${path} to the generated package files.`,
        detail: {},
      },
    ];
  });
}

function validateAllowedPaths(
  starterId: AppWriterStarterId,
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const findings: AppGenerationValidationFinding[] = [];

  for (const path of files.keys()) {
    if (isAllowedPath(starterId, path)) {
      continue;
    }

    findings.push({
      code: 'file_path_not_allowed',
      severity: 'error',
      message: `Generated file ${path} is outside the ${starterId} file allowlist.`,
      file: path,
      field: null,
      fix: 'Return only files in the Lantern starter allowlist.',
      detail: {
        starterId,
      },
    });
  }

  return findings;
}

function validateStaticPolicy(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const findings: AppGenerationValidationFinding[] = [];

  for (const file of files.values()) {
    if (!isStaticSourceFile(file.path)) {
      continue;
    }

    if (isPinnedStylePath(file.path)) {
      continue;
    }

    findings.push(...findPolicyMatches(file, STATIC_POLICY_RULES));
  }

  return findings;
}

function validateSdkCapabilities(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const manifestFile = files.get('manifest.json');
  const appFile = files.get('dist/app.js');

  if (!manifestFile || !appFile) {
    return [];
  }

  let manifest: { capabilities?: unknown };

  try {
    manifest = JSON.parse(manifestFile.contents) as { capabilities?: unknown };
  } catch {
    return [];
  }

  if (!Array.isArray(manifest.capabilities)) {
    return [];
  }

  const declaredCapabilities = new Set(
    manifest.capabilities.filter(
      (capability): capability is Capability => typeof capability === 'string',
    ),
  );
  const findings: AppGenerationValidationFinding[] = [];

  for (const [method, capability] of Object.entries(GATEWAY_METHOD_CAPABILITIES)) {
    if (!usesGatewayMethod(appFile.contents, method) || declaredCapabilities.has(capability)) {
      continue;
    }

    findings.push({
      code: 'sdk_capability_missing',
      severity: 'error',
      message: `Generated app calls GatewayApp.${method}() but manifest capabilities do not include ${capability}.`,
      file: 'dist/app.js',
      field: '/capabilities',
      fix: `Add ${capability} to manifest capabilities or remove the GatewayApp.${method}() call.`,
      detail: {
        method,
        capability,
      },
    });
  }

  return findings;
}

function normalizeGeneratedPath(path: string): string | null {
  const trimmed = path.trim();

  if (
    trimmed === '' ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.split('/').includes('..')
  ) {
    return null;
  }

  return trimmed.replaceAll(/\/+/g, '/');
}

function isAllowedPath(starterId: AppWriterStarterId, path: string): boolean {
  if (REQUIRED_BASELINE_FILES.includes(path as (typeof REQUIRED_BASELINE_FILES)[number])) {
    return true;
  }

  if (/^dist\/[a-zA-Z0-9._-]+\.(?:html|js|css)$/.test(path)) {
    return true;
  }

  if (path === 'scoring/rubric.json') {
    return true;
  }

  if (starterId === 'browser-autograder') {
    return (
      /^grading\/specs\/[a-zA-Z0-9._-]+\.js$/.test(path) || path === 'evidence/example-output.json'
    );
  }

  return false;
}

function isStaticSourceFile(path: string): boolean {
  return (
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.json')
  );
}

function isPinnedStylePath(path: string): boolean {
  return Object.hasOwn(PINNED_STYLE_FILES, path);
}

function findPolicyMatches(
  file: AppWriterWorkspaceFile,
  rules: readonly StaticPolicyRule[],
): AppGenerationValidationFinding[] {
  return rules.flatMap((rule) => {
    if (!rule.pattern.test(file.contents)) {
      return [];
    }

    return [
      {
        code: rule.code,
        severity: 'error' as const,
        message: rule.message,
        file: file.path,
        field: null,
        fix: rule.fix,
        detail: {},
      },
    ];
  });
}

function usesGatewayMethod(source: string, method: string): boolean {
  return new RegExp(`(?:GatewayApp|gateway)\\s*\\.\\s*${method}\\s*\\(`).test(source);
}

interface StaticPolicyRule {
  code: string;
  pattern: RegExp;
  message: string;
  fix: string;
}

const STATIC_POLICY_RULES: readonly StaticPolicyRule[] = [
  {
    code: 'external_network_forbidden',
    pattern: /\bfetch\s*\(|https?:\/\//i,
    message: 'Generated apps cannot use arbitrary outbound network access.',
    fix: 'Use Lantern GatewayApp methods and reviewed package files instead of external network calls.',
  },
  {
    code: 'external_script_forbidden',
    pattern: /<script\b[^>]*\bsrc=["']https?:\/\//i,
    message: 'Generated apps cannot load external scripts.',
    fix: 'Keep all runtime code inside reviewed package files.',
  },
  {
    code: 'imports_forbidden',
    pattern: /(^|\n)\s*import\s|import\s*\(/,
    message: 'Generated apps cannot import packages or remote modules.',
    fix: 'Use plain browser JavaScript and the Lantern GatewayApp SDK.',
  },
  {
    code: 'browser_storage_forbidden',
    pattern: /\b(?:localStorage|sessionStorage)\b/,
    message: 'Generated apps cannot use localStorage or sessionStorage.',
    fix: 'Use GatewayApp.readLocalState() and GatewayApp.writeLocalState() when local state is declared.',
  },
  {
    code: 'platform_boundary_forbidden',
    pattern:
      /\b(?:canvas\.instructure|canvas lms|moodle|sakai|lti|access_token|line_item|lineItem|writeGrade|gradePassback|D1|R2)\b/i,
    message:
      'Generated apps cannot reference LMS, grade passback, or Cloudflare platform internals.',
    fix: 'Keep LMS, grading, storage, and Cloudflare concerns behind Lantern.',
  },
];
