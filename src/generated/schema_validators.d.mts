import type { ValidateFunction } from 'ajv';
import type { AppManifest } from '../package_review/manifest_contract.ts';
import type { RawReviewedRubric } from '../grading/types.ts';

/** Validate a package manifest against the checked-in JSON schema. */
export const manifestValidator: ValidateFunction<AppManifest>;
/** Validate a reviewed rubric against the checked-in JSON schema. */
export const reviewedRubricValidator: ValidateFunction<RawReviewedRubric>;
