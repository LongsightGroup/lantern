import type { Capability } from '../../sdk/app-sdk.ts';
import { preflightLocalAppPackageSource } from '../authoring/local_app.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type {
  AppGenerationValidationFinding,
  AppWriterStarterId,
  AppWriterWorkspaceFile,
} from './types.ts';

const REQUIRED_BASELINE_FILES = [
  'manifest.json',
  'dist/index.html',
  'dist/app.js',
  'content/activity.json',
  'preview/fixtures.json',
  'preview/tests.json',
] as const;

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
  const normalizedFiles = normalizeWorkspaceFiles(input.files, findings);

  findings.push(...validateRequiredFiles(normalizedFiles));
  findings.push(...validateAllowedPaths(input.selectedStarterId, normalizedFiles));
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
