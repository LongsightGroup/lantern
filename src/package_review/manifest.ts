import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "npm:ajv@8.18.0/dist/2020.js";
import manifestSchema from "../../schemas/app-manifest.schema.json" with {
  type: "json",
};
import type { Capability, UserRole } from "../../sdk/app-sdk.ts";
import type {
  GradingSettings,
  InstallScope,
  PackageOwner,
  ValidationIssue,
} from "./types.ts";

interface AppManifest {
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

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});

const validator: ValidateFunction<AppManifest> = ajv.compile<AppManifest>(
  manifestSchema,
);

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

    const issue = mapManifestIssue(error);
    const key = `${issue.field}:${issue.keyword}`;

    if (!issues.has(key)) {
      issues.set(key, issue);
    }
  }

  return [...issues.values()];
}

export async function validateManifest(
  options: { sourceRoot: string },
): Promise<ManifestValidationResult> {
  const manifestPath = joinFileSystemPath(options.sourceRoot, "manifest.json");
  const manifestJson = await readManifestJson(manifestPath);

  if ("issues" in manifestJson) {
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
  const fileIssues = await collectReferencedFileIssues(
    options.sourceRoot,
    manifest,
  );

  if (fileIssues.length > 0) {
    return {
      ok: false,
      issues: fileIssues,
    };
  }

  return {
    ok: true,
    issues: [],
    reviewData: {
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
    },
  };
}

async function readManifestJson(
  manifestPath: string,
): Promise<
  | { value: unknown }
  | { issues: ValidationIssue[] }
> {
  let sourceText: string;

  try {
    sourceText = await Deno.readTextFile(manifestPath);
  } catch {
    return {
      issues: [createMissingFileIssue("/manifest.json", "/manifest.json")],
    };
  }

  try {
    return {
      value: JSON.parse(sourceText),
    };
  } catch {
    return {
      issues: [
        {
          field: "/manifest.json",
          keyword: "invalid_json",
          severity: "error",
          message: "Manifest must be valid JSON before Lantern can review it.",
        },
      ],
    };
  }
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

  if (error.keyword === "enum") {
    return {
      field: error.instancePath,
      keyword: error.keyword,
      severity: "error",
      message: `${
        displayFieldName(error.instancePath)
      } must use a supported value.`,
    };
  }

  if (error.keyword === "minItems") {
    return {
      field: error.instancePath,
      keyword: error.keyword,
      severity: "error",
      message: `${
        displayFieldName(error.instancePath)
      } must include at least one item.`,
    };
  }

  if (error.keyword === "uniqueItems") {
    return {
      field: error.instancePath,
      keyword: error.keyword,
      severity: "error",
      message: `${
        displayFieldName(error.instancePath)
      } cannot include duplicates.`,
    };
  }

  if (error.keyword === "minLength") {
    return {
      field: error.instancePath,
      keyword: error.keyword,
      severity: "error",
      message: `${displayFieldName(error.instancePath)} cannot be blank.`,
    };
  }

  if (error.keyword === "maximum" || error.keyword === "minimum") {
    return {
      field: error.instancePath,
      keyword: error.keyword,
      severity: "error",
      message: `${
        displayFieldName(error.instancePath)
      } must stay within the supported range.`,
    };
  }

  if (error.keyword === "type") {
    return {
      field: error.instancePath,
      keyword: error.keyword,
      severity: "error",
      message: `${
        displayFieldName(error.instancePath)
      } has the wrong value type.`,
    };
  }

  return {
    field: error.instancePath || "/",
    keyword: error.keyword,
    severity: "error",
    message: `${
      displayFieldName(error.instancePath)
    } is not valid for Lantern review.`,
  };
}

function requiredFieldMessage(field: string): string {
  if (field === "/grading/rubric_file") {
    return "Declarative grading requires a rubric file.";
  }

  if (field === "/grading/max_score") {
    return "Declarative grading requires a max score.";
  }

  return `${
    displayFieldName(field)
  } is required before Lantern can review this package.`;
}

async function collectReferencedFileIssues(
  sourceRoot: string,
  manifest: AppManifest,
): Promise<ValidationIssue[]> {
  const references: Array<{ field: string; path: string }> = [
    {
      field: "/entrypoint",
      path: manifest.entrypoint,
    },
  ];

  if (manifest.grading.rubric_file) {
    references.push({
      field: "/grading/rubric_file",
      path: manifest.grading.rubric_file,
    });
  }

  for (const [index, filePath] of (manifest.content_files ?? []).entries()) {
    references.push({
      field: `/content_files/${index}`,
      path: filePath,
    });
  }

  if (manifest.preview) {
    references.push({
      field: "/preview/fixtures_file",
      path: manifest.preview.fixtures_file,
    });
    references.push({
      field: "/preview/tests_file",
      path: manifest.preview.tests_file,
    });
  }

  if (manifest.icon) {
    references.push({
      field: "/icon",
      path: manifest.icon,
    });
  }

  const issues: ValidationIssue[] = [];

  for (const reference of references) {
    const exists = await fileExists(
      joinFileSystemPath(sourceRoot, trimLeadingSlash(reference.path)),
    );

    if (!exists) {
      issues.push(createMissingFileIssue(reference.field, reference.path));
    }
  }

  const layoutEntrypointExists = await fileExists(
    joinFileSystemPath(sourceRoot, "dist", "index.html"),
  );

  if (!layoutEntrypointExists) {
    issues.push({
      field: "/entrypoint",
      keyword: "missing_file",
      severity: "error",
      message:
        "Package must include /dist/index.html for the reviewed app shell.",
    });
  }

  return issues;
}

function createMissingFileIssue(field: string, path: string): ValidationIssue {
  return {
    field,
    keyword: "missing_file",
    severity: "error",
    message: `Referenced file ${path} is missing from the package.`,
  };
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

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function joinFileSystemPath(...segments: string[]): string {
  if (segments.length === 0) {
    return ".";
  }

  const [firstSegment = ".", ...rest] = segments;
  let path = firstSegment.replace(/\/+$/, "");

  for (const segment of rest) {
    path = `${path}/${segment.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  }

  return path.replace(/\/{2,}/g, "/");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }

    throw error;
  }
}
