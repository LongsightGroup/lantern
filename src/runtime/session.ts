import { CompactSign } from "jose";
import type { BootstrapPayload } from "../../sdk/app-sdk.ts";
import { loadToolSigningKey } from "../lti/tool_key.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";
import type { EnvReader } from "../platform/env.ts";
import { toRelativeSnapshotPath } from "../package_review/snapshot_path.ts";
import {
  buildRuntimeSessionBaseUrl,
  requireConfiguredRuntimeOrigin,
} from "../runtime_origin.ts";
import type { RuntimeArtifactStore } from "./artifact_store.ts";
import {
  classifyRuntimeArtifactFailureCode,
  type ReviewedRuntimeDeliveryContext,
  type RuntimeDelivery,
  runtimeEntrypointRelativePath,
} from "./delivery.ts";
import {
  buildRuntimeBootstrapScript,
  escapeHtmlAttribute,
  injectBeforeClosingTag,
} from "./session_html.ts";
import {
  errorMessage,
  failRuntimeOutcome,
  isRuntimeOutcomeError,
} from "./gateway_errors.ts";

const RUNTIME_BOOTSTRAP_JWS_TYPE = "application/lantern-runtime-bootstrap+jws";
const textEncoder = new TextEncoder();

export function authorizeRuntimeSession(input: {
  token: string;
  expected: RuntimeSessionRecord;
  now?: () => Date;
}): RuntimeSessionRecord {
  const now = input.now ?? (() => new Date());
  const token = input.token.trim();

  if (token === "") {
    failRuntimeOutcome({
      type: "deny",
      code: "session_token_missing",
      message: "Runtime session token is required.",
      status: 409,
      detail: {},
    });
  }

  if (token !== input.expected.sessionToken) {
    failRuntimeOutcome({
      type: "deny",
      code: "session_token_mismatch",
      message: "Runtime session token did not match the requested session.",
      status: 409,
      detail: {},
    });
  }

  if (Date.parse(input.expected.expiresAt) <= now().getTime()) {
    failRuntimeOutcome({
      type: "timeout",
      code: "session_expired",
      message: "Runtime session has expired.",
      status: 409,
      detail: {},
    });
  }

  return input.expected;
}

export async function renderRuntimeSessionPage(
  session: RuntimeSessionRecord,
  input: {
    runtimeOrigin?: string;
    env: EnvReader;
    runtimeDelivery: RuntimeDelivery;
    reviewedPackage: ReviewedRuntimeDeliveryContext["reviewedPackage"];
  },
): Promise<string> {
  const entrypointHtml = new TextDecoder().decode(
    (
      await input.runtimeDelivery.loadReviewedAsset({
        session,
        reviewedPackage: input.reviewedPackage,
        relativePath: runtimeEntrypointRelativePath(session),
      })
    ).bytes,
  );
  const runtimeOrigin = input.runtimeOrigin ??
    requireConfiguredRuntimeOrigin(input.env.get("APP_RUNTIME_ORIGIN"));
  const runtimeBaseUrl = buildRuntimeSessionBaseUrl({
    runtimeOrigin,
    sessionId: session.sessionId,
  });
  const entrypointDirectory = entrypointDirectoryPath(session);
  const assetBaseUrl = `${runtimeBaseUrl}/files/__token__/${
    encodeURIComponent(
      session.sessionToken,
    )
  }/${entrypointDirectory}`;
  const bootstrap = await buildRuntimeBootstrap({
    session,
    runtimeContractSignature: input.reviewedPackage.runtimeContractSignature,
    env: input.env,
  });
  const headInjection = `<base href="${escapeHtmlAttribute(assetBaseUrl)}">`;
  const bodyInjection = `<script>${
    buildRuntimeBootstrapScript({
      bootstrap,
      runtimeBaseUrl,
      previewSessionId: session.preview?.previewSessionId ?? null,
    })
  }</script>`;

  return injectBeforeClosingTag(
    injectBeforeClosingTag(entrypointHtml, "head", headInjection),
    "body",
    bodyInjection,
  );
}

export async function loadRuntimeActivityContent(
  session: RuntimeSessionRecord,
  artifactStore: RuntimeArtifactStore,
): Promise<unknown> {
  const bytes = await readRuntimeBytes(
    session,
    toRelativeSnapshotPath(
      session.snapshotRoot,
      session.contentPath,
      "Runtime file is outside the reviewed snapshot.",
    ),
    artifactStore,
  );

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    failRuntimeOutcome({
      type: "integrity_failure",
      code: "runtime_content_invalid",
      message: "Reviewed runtime content is not valid JSON.",
      status: 409,
      detail: {
        contentPath: session.contentPath,
        reason: errorMessage(error),
      },
    });
  }
}

async function readRuntimeBytes(
  session: RuntimeSessionRecord,
  relativePath: string,
  artifactStore: RuntimeArtifactStore,
): Promise<Uint8Array> {
  try {
    return await artifactStore.readBytes(session.snapshotRoot, relativePath);
  } catch (error) {
    if (isRuntimeOutcomeError(error)) {
      throw error;
    }

    failRuntimeOutcome({
      type: "integrity_failure",
      code: classifyRuntimeArtifactFailureCode(error),
      message: errorMessage(error),
      status: 409,
      detail: {
        relativePath,
      },
    });
  }
}

async function buildRuntimeBootstrap(input: {
  session: RuntimeSessionRecord;
  runtimeContractSignature: string;
  env: EnvReader;
}): Promise<BootstrapPayload> {
  const unsignedBootstrap = buildUnsignedBootstrapPayload({
    session: input.session,
    runtimeContractSignature: input.runtimeContractSignature,
  });

  return {
    ...unsignedBootstrap,
    signature: await signRuntimeBootstrapPayload({
      bootstrap: unsignedBootstrap,
      env: input.env,
    }),
  };
}

function buildUnsignedBootstrapPayload(input: {
  session: RuntimeSessionRecord;
  runtimeContractSignature: string;
}): Omit<BootstrapPayload, "signature"> {
  return {
    launch: {
      user_role: input.session.launch.userRole,
      course_id: input.session.launch.courseId,
      ...(input.session.launch.assignmentId === undefined
        ? {}
        : { assignment_id: input.session.launch.assignmentId }),
      activity_id: input.session.launch.activityId,
      submission_mode: input.session.launch.submissionMode,
    },
    app: {
      app_id: input.session.appId,
      version: input.session.packageVersion,
      capabilities: input.session.capabilities,
      runtime_contract_signature: input.runtimeContractSignature,
    },
    session: {
      attempt_id: input.session.attemptId,
      token: input.session.sessionToken,
      expires_at: input.session.expiresAt,
    },
  };
}

async function signRuntimeBootstrapPayload(input: {
  bootstrap: Omit<BootstrapPayload, "signature">;
  env: EnvReader;
}): Promise<string> {
  const toolKey = await loadToolSigningKey(input.env);

  return await new CompactSign(
    textEncoder.encode(JSON.stringify(input.bootstrap)),
  )
    .setProtectedHeader({
      alg: toolKey.privateJwk.alg,
      kid: toolKey.publicJwk.kid,
      typ: RUNTIME_BOOTSTRAP_JWS_TYPE,
    })
    .sign(toolKey.privateKey);
}

function entrypointDirectoryPath(session: RuntimeSessionRecord): string {
  const relativeEntrypoint = toRelativeSnapshotPath(
    session.snapshotRoot,
    session.entrypointPath,
    "Runtime file is outside the reviewed snapshot.",
  );
  const index = relativeEntrypoint.lastIndexOf("/");

  if (index < 0) {
    return "";
  }

  return `${relativeEntrypoint.slice(0, index + 1)}`;
}
