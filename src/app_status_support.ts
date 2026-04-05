import {
  isLaunchRejectionError,
  isLtiBoundaryDenialError,
} from "./lti/launch_rejection.ts";
import {
  isRuntimeBrokerDenialError,
  isRuntimeOutcomeError,
} from "./runtime/gateway_errors.ts";

export function deepLinkingReturnErrorMessage(error: unknown): string {
  const message = errorMessage(error);

  if (
    message.includes("APP_ORIGIN") || message.includes("LTI_TOOL_PRIVATE_JWK")
  ) {
    return "Lantern could not prepare the signed LMS return. Contact an operator and try again.";
  }

  return message;
}

export function statusForError(error: unknown): 409 | 500 {
  if (isLaunchRejectionError(error)) {
    return 409;
  }

  if (!(error instanceof Error)) {
    return 500;
  }

  const loweredMessage = error.message.toLowerCase();

  if (
    error.message ===
      "APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions."
  ) {
    return 500;
  }

  if (
    error.message.includes("already exists") ||
    error.message.includes("cannot change state") ||
    error.message.includes("Only approved") ||
    error.message.includes("does not belong") ||
    error.message.includes("Unsupported LTI ") ||
    error.message.includes("not found") ||
    error.message.includes("required") ||
    error.message.includes("Choose ") ||
    error.message.includes("belongs to another deployment") ||
    error.message.includes("must send client_id") ||
    error.message.includes("Choose one supported Canvas environment") ||
    error.message.includes("Choose one supported LMS deployment") ||
    error.message.includes("active LTI profile") ||
    error.message.includes("dynamic registration") ||
    error.message.includes("callback route") ||
    error.message.includes("already been used") ||
    error.message.includes("has expired") ||
    error.message.includes("Canvas deployment") ||
    error.message.includes("Canvas sent deployment") ||
    error.message.includes("Canvas issuer") ||
    error.message.includes("Login state") ||
    error.message.includes("Launch ") ||
    error.message.includes("Preview ") ||
    loweredMessage.includes("test launch")
  ) {
    return 409;
  }

  return 500;
}

export function statusForDeepLinkingError(error: unknown): 400 | 409 | 500 {
  if (isLtiBoundaryDenialError(error)) {
    return error.category === "policyDenied" ? 409 : 400;
  }

  return 500;
}

export function statusForDeepLinkingSessionError(
  error: unknown,
): 404 | 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (error.message.includes("was not found")) {
    return 404;
  }

  if (
    error.message.includes("Deep Linking session") ||
    error.message.includes("Choose one reviewed resource") ||
    error.message.includes("selection")
  ) {
    return 409;
  }

  return 500;
}

export function statusForVerificationError(error: unknown): 400 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("required") ||
    error.message.includes("Only ") ||
    error.message.includes("Internal ") ||
    error.message.includes("Official ") ||
    error.message.includes("Choose ") ||
    error.message.includes("Verification ")
  ) {
    return 400;
  }

  return 500;
}

export function statusForRuntimeError(error: unknown): 400 | 404 | 409 | 500 {
  if (isRuntimeBrokerDenialError(error)) {
    return error.status;
  }

  if (isRuntimeOutcomeError(error)) {
    return error.status;
  }

  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message ===
      "APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions."
  ) {
    return 500;
  }

  if (error.message.includes("was not found")) {
    return 404;
  }

  if (
    error.message.includes("Runtime session") ||
    error.message.includes("Runtime file") ||
    error.message.includes("required") ||
    error.message.includes("Attempt ") ||
    error.message.includes("Unsupported attempt event") ||
    error.message.includes("does not allow") ||
    error.message.includes("Finalize ")
  ) {
    return 409;
  }

  return 500;
}

export function statusForPlacementAuditError(error: unknown): 400 | 404 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (error.message.includes("was not found")) {
    return 404;
  }

  if (error.message.includes("required")) {
    return 400;
  }

  return 500;
}

export function statusForFinalizePublishError(code: string): 409 | 500 {
  if (
    code === "missing_binding" ||
    code === "missing_ags_context" ||
    code === "missing_ags_scope"
  ) {
    return 409;
  }

  return 500;
}

export function statusForNrpsError(error: unknown): 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("required") ||
    error.message.includes("Launch ") ||
    error.message.includes("Canvas deployment binding") ||
    error.message.includes("Import a package version") ||
    error.message.includes("roster access") ||
    error.message.includes("NRPS")
  ) {
    return 409;
  }

  return 500;
}

export function statusForRetryPublishError(error: unknown): 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("required") ||
    error.message.includes("Save the Canvas binding") ||
    error.message.includes("could not find a failed grade publication") ||
    error.message.includes("saved runtime session") ||
    error.message.includes("AGS service context") ||
    error.message.includes("saved Canvas binding")
  ) {
    return 409;
  }

  return 500;
}

export function normalizeLaunchRejectedCode(error: unknown): string {
  const message = errorMessage(error);

  if (message.includes("signature or issuer validation failed")) {
    return "signature_validation_failed";
  }

  if (message.includes("did not match the saved login state")) {
    return "deployment_mismatch";
  }

  if (message.includes("has expired")) {
    return "login_state_expired";
  }

  if (message.includes("has already been used")) {
    return "login_state_used";
  }

  if (message.includes("was not found")) {
    return "launch_context_missing";
  }

  if (message.includes("not approved")) {
    return "package_not_approved";
  }

  return "launch_validation_failed";
}

export function normalizeRetryFailureCode(error: unknown): string {
  const message = errorMessage(error);

  if (message.includes("could not find a failed grade publication")) {
    return "retry_not_available";
  }

  if (message.includes("saved runtime session")) {
    return "missing_runtime_session";
  }

  if (message.includes("AGS service context")) {
    return "missing_ags_context";
  }

  if (message.includes("saved Canvas binding")) {
    return "missing_binding";
  }

  if (message.includes("token")) {
    return "token_request_failed";
  }

  return "retry_failed";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Lantern hit an unexpected error.";
}
