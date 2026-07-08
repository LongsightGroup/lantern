import type { Capability } from '../../sdk/app-sdk.ts';
import type {
  AppGenerationPlan,
  AppGenerationValidationFinding,
  AppWriterWorkspaceFile,
} from './types.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';

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

  const manifest = parsePlanManifest(manifestFile.contents);

  if (manifest === null) {
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
      message:
        `Generated manifest grading mode must match planned mode ${input.appPlan.grading.mode}.`,
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
      message:
        `Generated manifest max score must match planned max score ${input.appPlan.grading.maxScore}.`,
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

interface PlanManifest {
  app_id?: unknown;
  title?: unknown;
  capabilities?: unknown;
  grading?: {
    mode?: unknown;
    max_score?: unknown;
  };
}

function parsePlanManifest(contents: string): PlanManifest | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const manifest: PlanManifest = {
    app_id: parsed.app_id,
    title: parsed.title,
    capabilities: parsed.capabilities,
  };

  if (isRecord(parsed.grading)) {
    manifest.grading = {
      mode: parsed.grading.mode,
      max_score: parsed.grading.max_score,
    };
  }

  return manifest;
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
      fix:
        `Remove ${capability} from manifest capabilities or repair the app plan before writing files.`,
      detail: {
        capability,
      },
    });
  }

  return findings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
