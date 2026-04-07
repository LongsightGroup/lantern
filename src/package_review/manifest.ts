import { Ajv2020, type ValidateFunction } from '@ajv2020';
import manifestSchema from '../../schemas/app-manifest.schema.json' with { type: 'json' };
import {
  type AppManifest,
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

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});

const validator: ValidateFunction<AppManifest> = ajv.compile<AppManifest>(manifestSchema);

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
