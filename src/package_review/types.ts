import type { Capability, UserRole } from "../../sdk/app-sdk.ts";
import type { DeploymentBinding } from "../lti/types.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type InstallScope = "course" | "assignment";
export type GradingMode = "declarative" | "manual" | "completion";
export type ValidationSeverity = "error";

export interface PackageOwner {
  type: "user";
  id: string;
}

export interface GradingSettings {
  mode: GradingMode;
  rubricFile: string | null;
  maxScore: number | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
  keyword: string;
  severity: ValidationSeverity;
}

export interface PackageArtifactRecord {
  snapshotRoot: string;
  manifestPath: string;
  entrypointPath: string;
  digest: string;
}

export interface PackageVersionRecord {
  id: number;
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
  approvalStatus: ApprovalStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  validationIssues: ValidationIssue[];
  manifestJson: Record<string, unknown>;
  artifact: PackageArtifactRecord;
  importedAt: string;
}

export interface DeploymentRecord {
  id: number;
  slug: string;
  label: string;
  appId: string;
  enabledPackageVersionId: number | null;
  enabledPackageVersion: string | null;
  binding: DeploymentBinding | null;
  updatedAt: string;
}
