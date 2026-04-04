import { CompactSign } from "jose";
import type { BootstrapPayload } from "../../sdk/app-sdk.ts";
import { loadToolSigningKey } from "../lti/tool_key.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";
import {
  assertPathInsideSnapshot,
  joinSnapshotPath,
  requireRelativeSnapshotPath,
  toRelativeSnapshotPath,
} from "../package_review/snapshot_path.ts";
import {
  buildRuntimeBootstrapScript,
  escapeHtmlAttribute,
  injectBeforeClosingTag,
} from "./session_html.ts";

const RUNTIME_BOOTSTRAP_JWS_TYPE = "application/lantern-runtime-bootstrap+jws";
const textEncoder = new TextEncoder();

interface EnvReader {
  get(name: string): string | undefined;
}

export function authorizeRuntimeSession(input: {
  token: string;
  expected: RuntimeSessionRecord;
  now?: () => Date;
}): RuntimeSessionRecord {
  const now = input.now ?? (() => new Date());
  const token = input.token.trim();

  if (token === "") {
    throw new Error("Runtime session token is required.");
  }

  if (token !== input.expected.sessionToken) {
    throw new Error(
      "Runtime session token did not match the requested session.",
    );
  }

  if (Date.parse(input.expected.expiresAt) <= now().getTime()) {
    throw new Error("Runtime session has expired.");
  }

  return input.expected;
}

export async function renderRuntimeSessionPage(
  session: RuntimeSessionRecord,
  input: {
    runtimeContractSignature: string;
    env?: EnvReader;
  },
): Promise<string> {
  const entrypointHtml = new TextDecoder().decode(
    await loadRuntimeEntrypointBytes(session),
  );
  const runtimeBasePath = `/runtime/sessions/${session.sessionId}`;
  const entrypointDirectory = entrypointDirectoryPath(session);
  const assetBaseUrl = `${runtimeBasePath}/files/__token__/${
    encodeURIComponent(
      session.sessionToken,
    )
  }/${entrypointDirectory}`;
  const bootstrap = await buildRuntimeBootstrap({
    session,
    runtimeContractSignature: input.runtimeContractSignature,
    ...(input.env === undefined ? {} : { env: input.env }),
  });
  const headInjection = `<base href="${escapeHtmlAttribute(assetBaseUrl)}">`;
  const bodyInjection = `<script>${
    buildRuntimeBootstrapScript({
      bootstrap,
      runtimeBasePath,
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
): Promise<unknown> {
  const bytes = await readRuntimeBytes(
    session,
    toRelativeSnapshotPath(
      session.snapshotRoot,
      session.contentPath,
      "Runtime file is outside the reviewed snapshot.",
    ),
  );

  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function loadRuntimeAssetBytes(
  session: RuntimeSessionRecord,
  relativePath: string,
): Promise<Uint8Array> {
  return await readRuntimeBytes(
    session,
    requireRelativeSnapshotPath(
      relativePath,
      "Runtime file path must stay inside the reviewed snapshot.",
    ),
  );
}

export function contentTypeForRuntimePath(path: string): string {
  if (path.endsWith(".html")) {
    return "text/html; charset=UTF-8";
  }

  if (path.endsWith(".js")) {
    return "application/javascript; charset=UTF-8";
  }

  if (path.endsWith(".css")) {
    return "text/css; charset=UTF-8";
  }

  if (path.endsWith(".json")) {
    return "application/json";
  }

  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (path.endsWith(".png")) {
    return "image/png";
  }

  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

async function loadRuntimeEntrypointBytes(
  session: RuntimeSessionRecord,
): Promise<Uint8Array> {
  return await readRuntimeBytes(
    session,
    toRelativeSnapshotPath(
      session.snapshotRoot,
      session.entrypointPath,
      "Runtime file is outside the reviewed snapshot.",
    ),
  );
}

async function readRuntimeBytes(
  session: RuntimeSessionRecord,
  relativePath: string,
): Promise<Uint8Array> {
  const absolutePath = joinSnapshotPath(
    session.snapshotRoot,
    relativePath,
    "Runtime file is outside the reviewed snapshot.",
  );

  assertPathInsideSnapshot(
    session.snapshotRoot,
    absolutePath,
    "Runtime file is outside the reviewed snapshot.",
  );

  return await Deno.readFile(absolutePath);
}

async function buildRuntimeBootstrap(input: {
  session: RuntimeSessionRecord;
  runtimeContractSignature: string;
  env?: EnvReader;
}): Promise<BootstrapPayload> {
  const unsignedBootstrap = buildUnsignedBootstrapPayload({
    session: input.session,
    runtimeContractSignature: input.runtimeContractSignature,
  });

  return {
    ...unsignedBootstrap,
    signature: await signRuntimeBootstrapPayload({
      bootstrap: unsignedBootstrap,
      ...(input.env === undefined ? {} : { env: input.env }),
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
  env?: EnvReader;
}): Promise<string> {
  const toolKey = await loadToolSigningKey(input.env ?? Deno.env);

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
