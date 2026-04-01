import type { RecordBrokerVerificationRunInput } from "./ops/repository.ts";
import { isBrokerVerificationSupportedPath } from "./ops/broker_verification_paths.ts";
import {
  normalizeOptionalString,
  requireTrimmedFormValue,
} from "./app_request_support.ts";

export function parseBrokerVerificationRunForm(
  formData: FormData,
): RecordBrokerVerificationRunInput {
  const source = parseBrokerVerificationSource(
    requireTrimmedFormValue(
      formData.get("source"),
      "Broker verification source is required.",
    ),
  );
  const status = parseBrokerVerificationStatus(
    requireTrimmedFormValue(
      formData.get("status"),
      "Broker verification status is required.",
    ),
  );
  const certificationState = parseBrokerCertificationState(
    normalizeOptionalString(formData.get("certificationState")),
  );
  const deploymentRecordId = parseOptionalDeploymentRecordId(
    normalizeOptionalString(formData.get("deploymentRecordId")),
  );
  const scope = parseBrokerVerificationScope(
    requireTrimmedFormValue(
      formData.get("scope"),
      "Broker verification scope is required.",
    ),
  );
  const workflowKey = parseCertificationWorkflowKey(
    requireTrimmedFormValue(
      formData.get("workflowKey"),
      "Certification workflow is required.",
    ),
  );

  if (source !== "1edtech" && certificationState !== null) {
    throw new Error(
      "Internal verification runs cannot carry an official certification state.",
    );
  }

  if (source !== "1edtech" && status === "notCertified") {
    throw new Error(
      "Only official 1EdTech verification runs can use the notCertified status.",
    );
  }

  return {
    deploymentRecordId,
    source,
    scope,
    workflowKey,
    status,
    certificationState,
    summary: requireTrimmedFormValue(
      formData.get("summary"),
      "Broker verification summary is required.",
    ),
    detailUrl: parseOptionalAbsoluteUrl(
      normalizeOptionalString(formData.get("detailUrl")),
      "Verification detail URL must be an absolute URL.",
    ),
    checkedAt: parseVerificationCheckedAt(
      requireTrimmedFormValue(
        formData.get("checkedAt"),
        "Checked-at timestamp is required.",
      ),
    ),
  };
}

function parseBrokerVerificationSource(
  value: string,
): RecordBrokerVerificationRunInput["source"] {
  switch (value) {
    case "manual":
    case "ci":
    case "1edtech":
      return value;
    default:
      throw new Error("Choose one supported broker verification source.");
  }
}

function parseBrokerVerificationScope(
  value: string,
): RecordBrokerVerificationRunInput["scope"] {
  if (isBrokerVerificationSupportedPath(value)) {
    return value;
  }

  throw new Error("Choose one supported broker verification scope.");
}

function parseCertificationWorkflowKey(
  value: string,
): RecordBrokerVerificationRunInput["workflowKey"] {
  switch (value) {
    case "core":
    case "deepLinking":
    case "nrps":
    case "ags":
      return value;
    default:
      throw new Error("Choose one supported certification workflow.");
  }
}

function parseBrokerVerificationStatus(
  value: string,
): RecordBrokerVerificationRunInput["status"] {
  switch (value) {
    case "passed":
    case "failed":
    case "pending":
    case "notCertified":
      return value;
    default:
      throw new Error("Choose one supported broker verification status.");
  }
}

function parseBrokerCertificationState(
  value: string | null,
): RecordBrokerVerificationRunInput["certificationState"] {
  switch (value) {
    case null:
      return null;
    case "ltiAdvantageCertified":
    case "ltiAdvantageComplete":
      return value;
    default:
      throw new Error("Choose one supported official certification state.");
  }
}

function parseOptionalAbsoluteUrl(
  value: string | null,
  message: string,
): string | null {
  if (value === null) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(message);
    }

    return url.toString();
  } catch {
    throw new Error(message);
  }
}

function parseOptionalDeploymentRecordId(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(
      "Broker verification deployment record id must be a positive integer.",
    );
  }

  return parsed;
}

function parseVerificationCheckedAt(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.valueOf())) {
    throw new TypeError("Checked-at timestamp must be a valid ISO-8601 value.");
  }

  return timestamp.toISOString();
}
