import { manifestValidator as validator } from '../generated/schema_validators.mjs';
import {
  buildManifestReviewData,
  explainManifestIssues,
  type ManifestReviewData,
  type ManifestValidationResult,
} from './manifest_contract.ts';
import type { PackageSource } from './package_source.ts';
import {
  collectReferencedFileIssuesFromSource,
  readManifestJsonFromSource,
} from './manifest_files.ts';

export { explainManifestIssues };
export type { ManifestReviewData, ManifestValidationResult };

export async function validateManifest(source: PackageSource): Promise<ManifestValidationResult> {
  const manifestJson = await readManifestJsonFromSource(source);

  if ('issues' in manifestJson) {
    return {
      ok: false,
      issues: manifestJson.issues,
    };
  }

  if (!validator(manifestJson.value)) {
    return {
      ok: false,
      issues: explainManifestIssues(validator.errors),
    };
  }

  const manifest = manifestJson.value;
  const fileIssues = await collectReferencedFileIssuesFromSource(source, manifest);

  if (fileIssues.length > 0) {
    return {
      ok: false,
      issues: fileIssues,
    };
  }

  return {
    ok: true,
    issues: [],
    reviewData: buildManifestReviewData(manifest),
  };
}

export { validateManifest as validateManifestSource };
