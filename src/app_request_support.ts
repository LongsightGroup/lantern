import type { Context } from "@hono/hono";
import { type LtiProfileId, requireLtiProfileId } from "./lti/profile.ts";
import type { LoginRequest } from "./lti/login.ts";
export { parseBrokerVerificationRunForm } from "./app_request_broker_verification.ts";

export interface LoginRequestCompatibility {
  decodedLoginHint: boolean;
  decodedLtiMessageHint: boolean;
}

export interface ReadLoginRequestResult {
  request: LoginRequest;
  compatibility: LoginRequestCompatibility;
}

export function normalizeOptionalString(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

export function requireTrimmedFormValue(
  value: FormDataEntryValue | null,
  message: string,
): string {
  if (typeof value !== "string") {
    throw new TypeError(message);
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(message);
  }

  return trimmed;
}

export function requireTrimmedString(
  value: string | null,
  message: string,
): string {
  if (value === null) {
    throw new Error(message);
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(message);
  }

  return trimmed;
}

export function normalizeNullableString(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

export function formValueAsString(
  value: FormDataEntryValue | null,
): string | null {
  return typeof value === "string" ? value : null;
}

export function parseLanternDefaultLtiProfileForm(
  formData: FormData,
): LtiProfileId {
  return requireLtiProfileId(
    requireTrimmedFormValue(
      formData.get("defaultLtiProfile"),
      "Choose one supported LTI profile.",
    ),
  );
}

export function parseDeploymentLtiProfileOverrideForm(
  formData: FormData,
): LtiProfileId | null {
  const value = normalizeOptionalString(formData.get("ltiProfileOverride"));

  return value === null ? null : requireLtiProfileId(value);
}

export function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

export async function readLoginRequest(
  context: Context,
): Promise<ReadLoginRequestResult> {
  if (context.req.method === "GET") {
    const url = new URL(context.req.url);
    const loginHint = requireOpaqueHint(
      url.searchParams.get("login_hint"),
      "LTI login_hint is required.",
    );
    const ltiMessageHint = normalizeOpaqueHint(
      url.searchParams.get("lti_message_hint"),
    );

    return {
      request: {
        iss: requireTrimmedString(
          url.searchParams.get("iss"),
          "LTI issuer is required.",
        ),
        loginHint: loginHint.value,
        targetLinkUri: normalizeNullableString(
          url.searchParams.get("target_link_uri"),
        ),
        clientId: normalizeNullableString(url.searchParams.get("client_id")),
        deploymentId: resolveLoginDeploymentId({
          primary: url.searchParams.get("deployment_id"),
          secondary: url.searchParams.get("lti_deployment_id"),
        }),
        ltiMessageHint: ltiMessageHint.value,
      },
      compatibility: {
        decodedLoginHint: loginHint.decoded,
        decodedLtiMessageHint: ltiMessageHint.decoded,
      },
    };
  }

  const formData = await context.req.formData();
  const loginHint = requireOpaqueFormValue(
    formData.get("login_hint"),
    "LTI login_hint is required.",
  );
  const ltiMessageHint = normalizeOpaqueFormValue(
    formData.get("lti_message_hint"),
  );

  return {
    request: {
      iss: requireTrimmedFormValue(
        formData.get("iss"),
        "LTI issuer is required.",
      ),
      loginHint: loginHint.value,
      targetLinkUri: normalizeOptionalString(formData.get("target_link_uri")),
      clientId: normalizeOptionalString(formData.get("client_id")),
      deploymentId: resolveLoginDeploymentId({
        primary: formValueAsString(formData.get("deployment_id")),
        secondary: formValueAsString(formData.get("lti_deployment_id")),
      }),
      ltiMessageHint: ltiMessageHint.value,
    },
    compatibility: {
      decodedLoginHint: loginHint.decoded,
      decodedLtiMessageHint: ltiMessageHint.decoded,
    },
  };
}

export function readRuntimeFileRequest(context: Context): {
  token: string;
  relativePath: string;
} {
  const pathname = new URL(context.req.url).pathname;
  const prefix = `/runtime/sessions/${context.req.param("sessionId")}/files/`;

  if (!pathname.startsWith(prefix)) {
    throw new Error("Runtime file path is invalid.");
  }

  const rawPath = pathname.slice(prefix.length);
  const tokenPrefix = "__token__/";

  if (rawPath.startsWith(tokenPrefix)) {
    const pathWithoutPrefix = rawPath.slice(tokenPrefix.length);
    const slashIndex = pathWithoutPrefix.indexOf("/");

    if (slashIndex < 0) {
      throw new Error("Runtime file path is invalid.");
    }

    const token = decodeURIComponent(pathWithoutPrefix.slice(0, slashIndex));
    const relativePath = decodeURIComponent(
      pathWithoutPrefix.slice(slashIndex + 1),
    );

    return {
      token: requireTrimmedString(token, "Runtime session token is required."),
      relativePath,
    };
  }

  return {
    token: requireTrimmedString(
      new URL(context.req.url).searchParams.get("token"),
      "Runtime session token is required.",
    ),
    relativePath: decodeURIComponent(rawPath),
  };
}

function resolveLoginDeploymentId(input: {
  primary: string | null;
  secondary: string | null;
}): string {
  const primary = normalizeNullableString(input.primary);
  const secondary = normalizeNullableString(input.secondary);

  if (primary !== null && secondary !== null && primary !== secondary) {
    throw new Error("LTI deployment_id and lti_deployment_id did not match.");
  }

  return requireTrimmedString(
    primary ?? secondary,
    "LTI deployment_id is required.",
  );
}

function normalizeOpaqueFormValue(
  value: FormDataEntryValue | null,
) {
  return normalizeOpaqueHint(formValueAsString(value));
}

function requireOpaqueFormValue(
  value: FormDataEntryValue | null,
  message: string,
) {
  return requireOpaqueHint(formValueAsString(value), message);
}

function requireOpaqueHint(value: string | null, message: string): {
  value: string;
  decoded: boolean;
} {
  const normalized = normalizeOpaqueHint(value);

  if (normalized.value === null) {
    throw new Error(message);
  }

  return {
    value: normalized.value,
    decoded: normalized.decoded,
  };
}

function normalizeOpaqueHint(value: string | null): {
  value: string | null;
  decoded: boolean;
} {
  const normalized = normalizeNullableString(value);

  if (normalized === null) {
    return {
      value: null,
      decoded: false,
    };
  }

  return decodeOpaqueHintOnce(normalized);
}

function decodeOpaqueHintOnce(value: string): {
  value: string;
  decoded: boolean;
} {
  if (!value.includes("%")) {
    return {
      value,
      decoded: false,
    };
  }

  try {
    const decoded = decodeURIComponent(value).trim();

    if (decoded === "") {
      return {
        value,
        decoded: false,
      };
    }

    if (
      value.includes("%25") ||
      (/%[0-9A-Fa-f]{2}/.test(value) && !/%[0-9A-Fa-f]{2}/.test(decoded))
    ) {
      return {
        value: decoded,
        decoded: true,
      };
    }
  } catch {
    return {
      value,
      decoded: false,
    };
  }

  return {
    value,
    decoded: false,
  };
}
