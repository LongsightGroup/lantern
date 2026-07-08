import type { Capability } from '../../sdk/app-sdk.ts';
import type { AppGenerationValidationFinding, AppWriterWorkspaceFile } from './types.ts';
import { isPinnedStylePath, isStaticSourceFile } from './validation_files.ts';

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

export function validateStaticPolicy(
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

export function validateSdkCapabilities(
  files: ReadonlyMap<string, AppWriterWorkspaceFile>,
): AppGenerationValidationFinding[] {
  const manifestFile = files.get('manifest.json');
  const appFile = files.get('dist/app.js');

  if (!manifestFile || !appFile) {
    return [];
  }

  let manifest: Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(manifestFile.contents);

    if (!isRecord(parsed)) {
      return [];
    }

    manifest = parsed;
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
      message:
        `Generated app calls GatewayApp.${method}() but manifest capabilities do not include ${capability}.`,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    fix:
      'Use Lantern GatewayApp methods and reviewed package files instead of external network calls.',
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
    code: 'module_exports_forbidden',
    pattern: /(^|\n)\s*export\s+(?:default|class|const|function|let|var|\{)/,
    message: 'Generated apps cannot use module exports.',
    fix: 'Keep reviewed app code as plain browser JavaScript loaded by dist/index.html.',
  },
  {
    code: 'browser_storage_forbidden',
    pattern: /\b(?:localStorage|sessionStorage)\b/,
    message: 'Generated apps cannot use localStorage or sessionStorage.',
    fix:
      'Use GatewayApp.readLocalState() and GatewayApp.writeLocalState() when local state is declared.',
  },
  {
    code: 'browser_persistent_storage_forbidden',
    pattern: /\bindexedDB\b|\bdocument\s*\.\s*cookie\b/,
    message: 'Generated apps cannot use browser persistent storage outside the Lantern gateway.',
    fix: 'Use GatewayApp local state and attempt events instead of cookies or IndexedDB.',
  },
  {
    code: 'dynamic_code_execution_forbidden',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
    message: 'Generated apps cannot use dynamic code execution.',
    fix: 'Use plain reviewed browser code with no eval or Function constructor.',
  },
  {
    code: 'worker_entrypoint_forbidden',
    pattern:
      /(?:^|\n)\s*export\s+default\s*\{[\s\S]{0,400}\bfetch\s*\(|(?:^|\n)\s*addEventListener\s*\(\s*["']fetch["']|\b(?:WorkerEntrypoint|ExportedHandler|ExecutionContext|ScheduledController|MessageBatch)\b/,
    message: 'Generated apps cannot define Cloudflare Worker entrypoints.',
    fix:
      'Keep Worker, routing, scheduling, and queue code in Lantern platform code. Generated apps must use window.GatewayApp only.',
  },
  {
    code: 'durable_object_forbidden',
    pattern:
      /\b(?:DurableObject|DurableObjectNamespace|DurableObjectState|Durable Object|Durable Objects|ctx\.storage|state\.storage|env\s*\.\s*[A-Z][A-Z0-9_]*\b)/i,
    message: 'Generated apps cannot reference Durable Objects or platform storage bindings.',
    fix:
      'Use GatewayApp local state and attempt events. Lantern may implement those capabilities with Durable Objects or D1 behind the gateway.',
  },
  {
    code: 'platform_boundary_forbidden',
    pattern:
      /\b(?:canvas\.instructure|canvas lms|moodle|sakai|lti|access_token|line_item|lineItem|writeGrade|gradePassback|Cloudflare|Workers?|D1|R2|Worker Loader)\b/i,
    message:
      'Generated apps cannot reference LMS, grade passback, or Cloudflare platform internals.',
    fix: 'Keep LMS, grading, storage, and Cloudflare concerns behind Lantern.',
  },
  {
    code: 'standards_runtime_forbidden',
    pattern:
      /\b(?:SCORM|LMSInitialize|LMSSetValue|LMSGetValue|LMSCommit|LMSFinish|API_1484_11|TinCan|xAPI|LRS|Learning Record Store|cmi5)\b/i,
    message: 'Generated apps cannot use SCORM, xAPI, cmi5, or LRS APIs directly.',
    fix:
      'Use Lantern GatewayApp local state, attempt events, and finalizeAttempt(). Lantern may export standards-shaped records behind the gateway later.',
  },
];
