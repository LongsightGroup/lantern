import type { BootstrapPayload } from "../../sdk/app-sdk.ts";
import type { RuntimeSessionRecord } from "../lti/types.ts";

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
): Promise<string> {
  const entrypointHtml = new TextDecoder().decode(
    await loadRuntimeEntrypointBytes(session),
  );
  const runtimeBasePath = `/runtime/sessions/${session.sessionId}`;
  const entrypointDirectory = entrypointDirectoryPath(session);
  const assetBaseUrl = `${runtimeBasePath}/files/${entrypointDirectory}?token=${
    encodeURIComponent(session.sessionToken)
  }`;
  const bootstrap = buildBootstrapPayload(session);
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
    requireRelativeRuntimePath(relativePath),
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
    toRelativeSnapshotPath(session.snapshotRoot, session.entrypointPath),
  );
}

async function readRuntimeBytes(
  session: RuntimeSessionRecord,
  relativePath: string,
): Promise<Uint8Array> {
  const absolutePath = joinSnapshotPath(session.snapshotRoot, relativePath);

  assertPathInsideSnapshot(session.snapshotRoot, absolutePath);

  return await Deno.readFile(absolutePath);
}

function buildBootstrapPayload(
  session: RuntimeSessionRecord,
): BootstrapPayload {
  return {
    launch: {
      user_role: session.launch.userRole,
      course_id: session.launch.courseId,
      ...(session.launch.assignmentId === undefined
        ? {}
        : { assignment_id: session.launch.assignmentId }),
      activity_id: session.launch.activityId,
    },
    app: {
      app_id: session.appId,
      version: session.packageVersion,
      capabilities: session.capabilities,
    },
    session: {
      attempt_id: session.attemptId,
      token: session.sessionToken,
    },
  };
}

function buildRuntimeBootstrapScript(input: {
  bootstrap: BootstrapPayload;
  runtimeBasePath: string;
  previewSessionId: string | null;
}): string {
  const bootstrapJson = serializeForInlineScript(input.bootstrap);
  const contentUrl = serializeForInlineScript(
    `${input.runtimeBasePath}/content`,
  );
  const attemptEventsUrl = serializeForInlineScript(
    `${input.runtimeBasePath}/attempt-events`,
  );
  const finalizeUrl = serializeForInlineScript(
    `${input.runtimeBasePath}/finalize`,
  );
  const previewJson = serializeForInlineScript(
    input.previewSessionId === null
      ? null
      : {
        previewSessionId: input.previewSessionId,
      },
  );

  return `window.GatewayBootstrap = ${bootstrapJson};
window.GatewayPreview = ${previewJson};
window.GatewayApp = {
  getLaunchContext() {
    return Promise.resolve({
      userRole: window.GatewayBootstrap.launch.user_role,
      courseId: window.GatewayBootstrap.launch.course_id,
      ...(window.GatewayBootstrap.launch.assignment_id
        ? { assignmentId: window.GatewayBootstrap.launch.assignment_id }
        : {}),
      activityId: window.GatewayBootstrap.launch.activity_id,
    });
  },
  async getActivityContent() {
    const response = await fetch(${contentUrl}, {
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
      },
    });

    if (!response.ok) {
      throw new Error('Activity content request failed with status ' + response.status + '.');
    }

    return await response.json();
  },
  async emitAttemptEvent(event) {
    const response = await fetch(${attemptEventsUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error('Attempt event request failed with status ' + response.status + '.');
    }
  },
  async finalizeAttempt(input) {
    const response = await fetch(${finalizeUrl}, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + window.GatewayBootstrap.session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input ?? {}),
    });

    if (!response.ok) {
      throw new Error('Finalize request failed with status ' + response.status + '.');
    }

    return await response.json();
  },
};`;
}

function entrypointDirectoryPath(session: RuntimeSessionRecord): string {
  const relativeEntrypoint = toRelativeSnapshotPath(
    session.snapshotRoot,
    session.entrypointPath,
  );
  const index = relativeEntrypoint.lastIndexOf("/");

  if (index < 0) {
    return "";
  }

  return `${relativeEntrypoint.slice(0, index + 1)}`;
}

function injectBeforeClosingTag(
  html: string,
  tagName: "head" | "body",
  injection: string,
): string {
  const closingTag = `</${tagName}>`;
  const index = html.lastIndexOf(closingTag);

  if (index < 0) {
    return `${html}${injection}`;
  }

  return `${html.slice(0, index)}${injection}${html.slice(index)}`;
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toRelativeSnapshotPath(
  snapshotRoot: string,
  absolutePath: string,
): string {
  const normalizedRoot = normalizeFilePath(snapshotRoot);
  const normalizedPath = normalizeFilePath(absolutePath);

  if (normalizedPath === normalizedRoot) {
    return "";
  }

  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error("Runtime file is outside the reviewed snapshot.");
  }

  return normalizedPath.slice(normalizedRoot.length + 1);
}

function requireRelativeRuntimePath(relativePath: string): string {
  const normalized = normalizeFilePath(relativePath);

  if (normalized === "" || normalized.startsWith("/")) {
    throw new Error(
      "Runtime file path must stay inside the reviewed snapshot.",
    );
  }

  return normalized;
}

function joinSnapshotPath(snapshotRoot: string, relativePath: string): string {
  const root = normalizeFilePath(snapshotRoot);
  const relative = normalizeFilePath(relativePath);

  return relative === "" ? root : `${root}/${relative}`;
}

function assertPathInsideSnapshot(
  snapshotRoot: string,
  targetPath: string,
): void {
  const normalizedRoot = normalizeFilePath(snapshotRoot);
  const normalizedTarget = normalizeFilePath(targetPath);

  if (
    normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error("Runtime file is outside the reviewed snapshot.");
  }
}

function normalizeFilePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(
          "Runtime file path must stay inside the reviewed snapshot.",
        );
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return `${isAbsolute ? "/" : ""}${segments.join("/")}`;
}
