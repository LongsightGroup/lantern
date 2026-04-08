import { type ErrorObject } from "@ajv2020";
import type { Capability, UserRole } from "../../sdk/app-sdk.ts";
import type {
  GradingSettings,
  InstallScope,
  PackageOwner,
  ValidationIssue,
} from "./types.ts";

export interface AppManifest {
  schema_version: "1";
  app_id: string;
  version: string;
  title: string;
  description?: string;
  owner: PackageOwner;
  entrypoint: string;
  roles: UserRole[];
  install_scope?: InstallScope;
  capabilities: Capability[];
  grading: {
    mode: GradingSettings["mode"];
    rubric_file?: string;
    max_score?: number;
  };
  browser?: {
    fullscreen?: boolean;
    clipboard_write?: boolean;
  };
  content_files?: string[];
  preview?: {
    fixtures_file: string;
    tests_file: string;
  };
  authoring?: {
    kind: "browser_autograder";
    grader_spec_files: string[];
    evidence_example_file: string;
  };
  icon?: string;
}

export interface ManifestReviewData {
  appId: string;
  version: string;
  title: string;
  description: string | null;
  owner: PackageOwner;
  entrypoint: string;
  roles: UserRole[];
  installScope: InstallScope;
  capabilities: Capability[];
  grading: GradingSettings;
  manifestJson: Record<string, unknown>;
  validationIssues: ValidationIssue[];
}

export type ManifestValidationResult =
  | {
    ok: true;
    issues: [];
    reviewData: ManifestReviewData;
  }
  | {
    ok: false;
    issues: ValidationIssue[];
  };

type RequiredKeywordParams = {
  missingProperty: string;
};

export function explainManifestIssues(
  errors: readonly ErrorObject[] | null | undefined,
): ValidationIssue[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  const issues = new Map<string, ValidationIssue>();

  for (const error of errors) {
    if (error.keyword === "if") {
      continue;
    }

    if (
      error.keyword === "const" &&
      error.instancePath.startsWith("/capabilities/")
    ) {
      continue;
    }

    const issue = mapManifestIssue(error);
    const key = `${issue.field}:${issue.keyword}`;

    if (!issues.has(key)) {
      issues.set(key, issue);
    }
  }

  return [...issues.values()];
}

export function buildManifestReviewData(
  manifest: AppManifest,
): ManifestReviewData {
  return {
    appId: manifest.app_id,
    version: manifest.version,
    title: manifest.title,
    description: manifest.description ?? null,
    owner: manifest.owner,
    entrypoint: manifest.entrypoint,
    roles: manifest.roles,
    installScope: manifest.install_scope ?? "course",
    capabilities: manifest.capabilities,
    grading: {
      mode: manifest.grading.mode,
      rubricFile: manifest.grading.rubric_file ?? null,
      maxScore: manifest.grading.max_score ?? null,
    },
    manifestJson: manifest as unknown as Record<string, unknown>,
    validationIssues: [],
  };
}

function mapManifestIssue(error: ErrorObject): ValidationIssue {
  if (error.keyword === "required") {
    const missingProperty =
      (error.params as RequiredKeywordParams).missingProperty;
    const field = joinJsonPointer(error.instancePath, missingProperty);

    return {
      field,
      keyword: error.keyword,
      severity: "error",
      message: requiredFieldMessage(field),
    };
  }

  if (error.keyword === "pattern" && error.instancePath === "/entrypoint") {
    return {
      field: "/entrypoint",
      keyword: error.keyword,
      severity: "error",
      message: "Entrypoint must stay inside /dist and end in .html.",
    };
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = String(
      (error.params as Record<string, unknown>).additionalProperty ?? "",
    );

    return {
      field: error.instancePath || "/",
      keyword: error.keyword,
      severity: "error",
      message: `Remove unsupported field ${additionalProperty}.`,
    };
  }

  if (error.keyword === "const" && error.instancePath === "/schema_version") {
    return {
      field: "/schema_version",
      keyword: error.keyword,
      severity: "error",
      message: 'Schema version must stay at "1" for this pilot.',
    };
  }

  if (error.keyword === "const" && error.instancePath === "/authoring/kind") {
    return {
      field: "/authoring/kind",
      keyword: error.keyword,
      severity: "error",
      message:
        'Browser grading requires authoring.kind = "browser_autograder".',
    };
  }

  if (error.keyword === "contains" && error.instancePath === "/capabilities") {
    return buildSimpleIssue(
      error,
      'Capability "submit_evidence_artifact" requires "finalize_attempt".',
    );
  }

  if (error.keyword === "enum") {
    return buildSimpleIssue(
      error,
      `${displayFieldName(error.instancePath)} must use a supported value.`,
    );
  }

  if (error.keyword === "minItems") {
    return buildSimpleIssue(
      error,
      `${displayFieldName(error.instancePath)} must include at least one item.`,
    );
  }

  if (error.keyword === "uniqueItems") {
    return buildSimpleIssue(
      error,
      `${displayFieldName(error.instancePath)} cannot include duplicates.`,
    );
  }

  if (error.keyword === "minLength") {
    return buildSimpleIssue(
      error,
      `${displayFieldName(error.instancePath)} cannot be blank.`,
    );
  }

  if (error.keyword === "maximum" || error.keyword === "minimum") {
    return buildSimpleIssue(
      error,
      `${
        displayFieldName(error.instancePath)
      } must stay within the supported range.`,
    );
  }

  if (error.keyword === "type") {
    return buildSimpleIssue(
      error,
      `${displayFieldName(error.instancePath)} has the wrong value type.`,
    );
  }

  return buildSimpleIssue(
    error,
    `${displayFieldName(error.instancePath)} is not valid for Lantern review.`,
  );
}

function buildSimpleIssue(
  error: ErrorObject,
  message: string,
): ValidationIssue {
  return {
    field: error.instancePath || "/",
    keyword: error.keyword,
    severity: "error",
    message,
  };
}

function requiredFieldMessage(field: string): string {
  if (field === "/grading/rubric_file") {
    return "Declarative grading requires a rubric file.";
  }

  if (field === "/grading/max_score") {
    return "Declarative and browser grading require a max score.";
  }

  if (field === "/authoring") {
    return "Browser grading requires reviewed authoring artifacts.";
  }

  if (field === "/authoring/kind") {
    return 'Browser grading requires authoring.kind = "browser_autograder".';
  }

  if (field === "/authoring/grader_spec_files") {
    return "Browser grading requires reviewed grader spec files.";
  }

  return `${
    displayFieldName(field)
  } is required before Lantern can review this package.`;
}

function joinJsonPointer(instancePath: string, property: string): string {
  if (!instancePath) {
    return `/${property}`;
  }

  return `${instancePath}/${property}`;
}

function displayFieldName(instancePath: string): string {
  if (!instancePath || instancePath === "/") {
    return "Manifest";
  }

  const segment = instancePath.split("/").filter(Boolean).at(-1) ?? "field";

  return segment.replaceAll("_", " ");
}
