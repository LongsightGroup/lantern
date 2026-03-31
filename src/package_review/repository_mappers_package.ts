import type {
  DeploymentBinding,
  DynamicRegistrationStateRecord,
  LoginStateRecord,
} from "../lti/types.ts";
import type { DeploymentRecord, PackageVersionRecord } from "./types.ts";
import type {
  DeploymentRow,
  DynamicRegistrationStateRow,
  LoginStateRow,
  PackageVersionRow,
} from "./repository_row_types.ts";
import {
  normalizeOptionalTimestamp,
  normalizeTimestamp,
} from "./repository_value_support.ts";

export function mapOptionalPackageVersion(
  row: PackageVersionRow | undefined,
): PackageVersionRecord | null {
  if (!row) {
    return null;
  }

  return mapPackageVersionRow(row);
}

export function mapPackageVersionRow(
  row: PackageVersionRow | undefined,
): PackageVersionRecord {
  if (!row) {
    throw new Error("Expected a package version row.");
  }

  return {
    id: row.id,
    appId: row.appId,
    version: row.version,
    title: row.title,
    description: row.description,
    owner: {
      type: row.ownerType,
      id: row.ownerId,
    },
    entrypoint: row.entrypoint,
    roles: row.roles,
    installScope: row.installScope,
    capabilities: row.capabilities,
    grading: {
      mode: row.gradingMode,
      rubricFile: row.gradingRubricFile,
      maxScore: row.gradingMaxScore,
    },
    approvalStatus: row.approvalStatus,
    reviewNotes: row.reviewNotes,
    reviewedAt: normalizeOptionalTimestamp(row.reviewedAt),
    validationIssues: row.validationIssues ?? [],
    manifestJson: row.manifestJson,
    artifact: {
      snapshotRoot: row.artifactRoot,
      manifestPath: `${row.artifactRoot}/manifest.json`,
      entrypointPath: `${row.artifactRoot}${row.entrypoint}`,
      digest: row.artifactDigest,
    },
    importedAt: normalizeTimestamp(row.importedAt),
  };
}

export function mapOptionalDeployment(
  row: DeploymentRow | undefined,
): DeploymentRecord | null {
  if (!row) {
    return null;
  }

  return mapDeploymentRow(row);
}

export function mapDeploymentRow(
  row: DeploymentRow | undefined,
): DeploymentRecord {
  if (!row) {
    throw new Error("Expected a deployment row.");
  }

  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    appId: row.appId,
    enabledPackageVersionId: row.enabledPackageVersionId,
    enabledPackageVersion: row.enabledPackageVersion,
    lmsType: row.lmsType,
    binding: mapDeploymentBinding(row),
    ltiProfileOverride: row.ltiProfileOverride,
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

export function mapDeploymentBinding(
  row: DeploymentRow,
): DeploymentBinding | null {
  if (
    row.issuer === null || row.clientId === null || row.deploymentId === null
  ) {
    return null;
  }

  switch (row.lmsType) {
    case "canvas":
      if (row.canvasEnvironment === null) {
        return null;
      }

      return {
        lms: "canvas",
        canvasEnvironment: row.canvasEnvironment,
        issuer: row.issuer,
        clientId: row.clientId,
        deploymentId: row.deploymentId,
      };
    case "moodle":
    case "sakai":
      if (
        row.authorizationEndpoint === null ||
        row.accessTokenUrl === null ||
        row.jwksUrl === null
      ) {
        return null;
      }

      return {
        lms: row.lmsType,
        issuer: row.issuer,
        clientId: row.clientId,
        deploymentId: row.deploymentId,
        authorizationEndpoint: row.authorizationEndpoint,
        accessTokenUrl: row.accessTokenUrl,
        jwksUrl: row.jwksUrl,
      };
    case "preview":
      return null;
  }
}

export function mapOptionalLoginState(
  row: LoginStateRow | undefined,
): LoginStateRecord | null {
  if (!row) {
    return null;
  }

  return mapLoginStateRow(row);
}

export function mapLoginStateRow(
  row: LoginStateRow | undefined,
): LoginStateRecord {
  if (!row) {
    throw new Error("Expected a login state row.");
  }

  if (row.lmsType === "canvas" && row.canvasEnvironment === null) {
    throw new Error("Canvas login state rows must include canvas_environment.");
  }

  if (row.lmsType !== "canvas" && row.canvasEnvironment !== null) {
    throw new Error(
      `${row.lmsType} login state rows cannot include canvas_environment.`,
    );
  }

  return {
    lms: row.lmsType,
    state: row.state,
    canvasEnvironment: row.canvasEnvironment,
    issuer: row.issuer,
    clientId: row.clientId,
    deploymentId: row.deploymentId,
    nonce: row.nonce,
    loginHint: row.loginHint,
    targetLinkUri: row.targetLinkUri,
    ltiMessageHint: row.ltiMessageHint,
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
    usedAt: normalizeOptionalTimestamp(row.usedAt),
  };
}

export function mapOptionalDynamicRegistrationState(
  row: DynamicRegistrationStateRow | undefined,
): DynamicRegistrationStateRecord | null {
  if (!row) {
    return null;
  }

  return mapDynamicRegistrationStateRow(row);
}

export function mapDynamicRegistrationStateRow(
  row: DynamicRegistrationStateRow | undefined,
): DynamicRegistrationStateRecord {
  if (!row) {
    throw new Error("Expected a dynamic registration state row.");
  }

  return {
    state: row.state,
    appId: row.appId,
    lms: row.lmsType,
    createdAt: normalizeTimestamp(row.createdAt),
    expiresAt: normalizeTimestamp(row.expiresAt),
    usedAt: normalizeOptionalTimestamp(row.usedAt),
  };
}
