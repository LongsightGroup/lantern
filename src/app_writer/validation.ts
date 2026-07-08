import { preflightLocalAppPackageSource } from '../authoring/local_app.ts';
import { createMemoryPackageSource } from '../package_review/package_source.ts';
import type {
  AppGenerationValidationFinding,
  AppWriterStarterId,
  AppWriterWorkspaceFile,
} from './types.ts';
import { selectPackageWorkspaceFiles } from './workspace_files.ts';
import {
  normalizeWorkspaceFiles,
  validateAllowedPaths,
  validateDesignContract,
  validatePinnedStyleFiles,
  validateRequiredFiles,
} from './validation_files.ts';
export { validateGeneratedAppPackagePlanAlignment } from './validation_plan_alignment.ts';
import { validateSdkCapabilities, validateStaticPolicy } from './validation_policy.ts';

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
  findings.push(...validateDesignContract(normalizedFiles));
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
