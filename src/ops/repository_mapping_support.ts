import { isLtiProfileId } from "../lti/profile.ts";
import type { LtiProfileId, ResolvedLtiProfile } from "../lti/profile.ts";
import type {
  CanvasEnvironment,
  DeploymentBinding,
  LmsType,
} from "../lti/types.ts";
import type {
  CertificationWorkflowKey,
  ControlPlaneActivityStatus,
  ControlPlaneBoundaryDenialCategory,
  ControlPlaneDiagnosticItem,
  ControlPlaneRuntimeEvidenceSnapshot,
} from "./types.ts";
import type { RecordBrokerVerificationRunInput } from "./repository_types.ts";

export function assertBrokerVerificationRunInput(
  input: RecordBrokerVerificationRunInput,
): void {
  if (!isCertificationWorkflowKey(input.workflowKey)) {
    throw new Error("Choose one supported certification workflow.");
  }

  if (input.source === "1edtech") {
    if (input.deploymentRecordId !== null) {
      throw new Error(
        "Official 1EdTech verification runs cannot be tied to one deployment.",
      );
    }

    if (input.status === "notCertified" && input.certificationState !== null) {
      throw new Error(
        "Official not-certified verification runs cannot carry a certification state.",
      );
    }

    if (input.status === "passed" && input.certificationState === null) {
      throw new Error(
        "Official passed verification runs require an explicit certification state.",
      );
    }

    return;
  }

  if (input.deploymentRecordId === null) {
    throw new Error(
      "Internal verification runs require an explicit deployment record id.",
    );
  }

  if (input.status === "notCertified") {
    throw new Error(
      "Only official 1EdTech verification runs can use the notCertified status.",
    );
  }

  if (input.certificationState !== null) {
    throw new Error(
      "Internal verification runs cannot carry an official certification state.",
    );
  }
}

export function isCertificationWorkflowKey(
  value: string,
): value is CertificationWorkflowKey {
  return value === "core" || value === "deepLinking" || value === "nrps" ||
    value === "ags";
}

export function mapDeploymentBinding(input: {
  lmsType?: LmsType | null;
  canvasEnvironment: string | null;
  issuer: string | null;
  clientId: string | null;
  deploymentId: string | null;
  authorizationEndpoint?: string | null;
  accessTokenUrl?: string | null;
  jwksUrl?: string | null;
}): DeploymentBinding | null {
  if (
    input.issuer === null || input.clientId === null ||
    input.deploymentId === null
  ) {
    return null;
  }

  const lmsType = input.lmsType ??
    (input.canvasEnvironment === null ? null : "canvas");

  switch (lmsType) {
    case "canvas":
      if (input.canvasEnvironment === null) {
        return null;
      }

      return {
        lms: "canvas",
        canvasEnvironment: input.canvasEnvironment as CanvasEnvironment,
        issuer: input.issuer,
        clientId: input.clientId,
        deploymentId: input.deploymentId,
      };
    case "moodle":
    case "sakai":
      if (
        input.authorizationEndpoint === null ||
        input.authorizationEndpoint === undefined ||
        input.accessTokenUrl === null ||
        input.accessTokenUrl === undefined ||
        input.jwksUrl === null ||
        input.jwksUrl === undefined
      ) {
        return null;
      }

      return {
        lms: lmsType,
        issuer: input.issuer,
        clientId: input.clientId,
        deploymentId: input.deploymentId,
        authorizationEndpoint: input.authorizationEndpoint,
        accessTokenUrl: input.accessTokenUrl,
        jwksUrl: input.jwksUrl,
      };
    case null:
      return null;
  }
}

export function normalizeTimestamp(value: Date | string | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null) {
    throw new Error("Expected a timestamp value.");
  }

  return value;
}

export function normalizeOptionalTimestamp(
  value: Date | string | null,
): string | null {
  if (value === null) {
    return null;
  }

  return normalizeTimestamp(value);
}

export function normalizeNumeric(value: number | string | bigint): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return Number(value);
}

export function mapAuditActivityStatus(
  eventType: string,
  status: string,
): ControlPlaneActivityStatus {
  if (eventType === "launch.rejected" || status === "failed") {
    return "failed";
  }

  if (status === "accepted" || status === "succeeded") {
    return "succeeded";
  }

  return "pending";
}

export function mapDiagnosticKind(
  eventType: string,
): ControlPlaneDiagnosticItem["kind"] {
  if (eventType.startsWith("launch.")) {
    return "launch";
  }

  if (eventType.startsWith("deep_linking.")) {
    return "deepLinking";
  }

  if (eventType === "deployment.nrps_verified") {
    return "nrps";
  }

  if (eventType.startsWith("broker_verification.")) {
    return "brokerVerification";
  }

  if (eventType.startsWith("runtime.")) {
    return "runtime";
  }

  if (eventType.startsWith("reviewer.")) {
    return "reviewer";
  }

  return "gradePublication";
}

export function readStringDetail(
  detail: Record<string, unknown>,
  key: string,
): string | null {
  const value = detail[key];
  return typeof value === "string" ? value : null;
}

export function readNumberDetail(
  detail: Record<string, unknown>,
  key: string,
): number | null {
  const value = detail[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

export function readBoundaryDenialCategoryDetail(
  detail: Record<string, unknown>,
): ControlPlaneBoundaryDenialCategory | null {
  const value = readStringDetail(detail, "category");

  return value === "policyDenied" || value === "specInvalid" ? value : null;
}

export function readRuntimeSandboxModelDetail(
  detail: Record<string, unknown>,
): ControlPlaneRuntimeEvidenceSnapshot["sandboxModel"] {
  const value = readStringDetail(detail, "sandboxModel");

  return value === "contained_browser_runtime" ? value : null;
}

export function readRuntimeBoundaryDetail(
  detail: Record<string, unknown>,
): ControlPlaneRuntimeEvidenceSnapshot["boundary"] {
  const value = readStringDetail(detail, "boundary");

  return value === "app_runtime_origin" ? value : null;
}

export function readRuntimeDeliverySubstrateDetail(
  detail: Record<string, unknown>,
): ControlPlaneRuntimeEvidenceSnapshot["deliverySubstrate"] {
  const value = readStringDetail(detail, "deliverySubstrate");

  return value === "direct" || value === "dynamic_worker" ? value : null;
}

export function readLtiProfileIdDetail(
  detail: Record<string, unknown>,
): LtiProfileId | null {
  const value = readStringDetail(detail, "ltiProfileId");

  return value !== null && isLtiProfileId(value) ? value : null;
}

export function readLtiProfileSourceDetail(
  detail: Record<string, unknown>,
): ResolvedLtiProfile["source"] | null {
  const value = readStringDetail(detail, "ltiProfileSource");

  return value === "lanternDefault" || value === "deploymentOverride"
    ? value
    : null;
}
