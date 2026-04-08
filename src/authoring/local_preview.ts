import {
  BootstrapPayload,
  Capability,
  GatewayFinalizeAcceptedResult,
  GatewayScoreProposalAcceptedResult,
  ScoreProposal,
} from "../../sdk/app-sdk.ts";
import { resolveSubmissionMode } from "../../sdk/app-sdk.ts";
import {
  buildRuntimeBootstrapScript,
  injectBeforeClosingTag,
} from "../runtime/session_html.ts";
import {
  denyRuntimeBroker,
  errorMessage,
  isRuntimeBrokerDenialError,
  toRuntimeBrokerResult,
} from "../runtime/gateway_errors.ts";
import {
  parseAttemptEvent,
  parseAttemptLocalState,
  parseFinalizeAttemptInput,
  parseScoreProposal,
} from "../runtime/gateway_parsing.ts";
import {
  buildBrowserGraderHarnessSource,
  buildBrowserGraderRunnerSource,
  readLocalBrowserGraderConfig,
} from "../runtime/browser_grader.ts";
import {
  joinSnapshotPath,
  trimLeadingSlash,
} from "../package_review/snapshot_path.ts";
import type { AttemptLocalState } from "../package_review/types.ts";
import type { AttemptEvent } from "../../sdk/app-sdk.ts";
import type { LocalAppPackage } from "./local_app.ts";

const DEFAULT_RUNTIME_BASE_PATH = "/_lantern/runtime";
const DEFAULT_PREVIEW_SESSION_ID = "local-authoring-preview";

export interface LocalPreviewLogEntry {
  eventType:
    | "preview.content_read"
    | "preview.local_state.read"
    | "preview.local_state.write"
    | "preview.attempt_event"
    | "preview.score_proposal"
    | "preview.finalize";
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface LocalPreviewHarness {
  bootstrap: BootstrapPayload;
  entrypointPath: string;
  previewSessionId: string;
  handle(request: Request): Promise<Response>;
}

export function createLocalPreviewHarness(input: {
  appPackage: LocalAppPackage;
  runtimeBasePath?: string;
  logger?: (entry: LocalPreviewLogEntry) => void;
}): LocalPreviewHarness {
  const runtimeBasePath = input.runtimeBasePath ?? DEFAULT_RUNTIME_BASE_PATH;
  const sessionToken = crypto.randomUUID().replaceAll("-", "");
  const previewSessionId = DEFAULT_PREVIEW_SESSION_ID;
  const logger = input.logger ?? (() => {});
  let localState: AttemptLocalState = input.appPackage.fixtureData.local_state;
  let latestScoreProposal: ScoreProposal | null = null;
  let finalized: {
    completionState: "completed" | "abandoned";
  } | null = null;
  const attemptEvents: AttemptEvent[] = [];
  const bootstrap = buildBootstrapPayload(input.appPackage, sessionToken);

  return {
    bootstrap,
    entrypointPath: input.appPackage.manifest.entrypoint,
    previewSessionId,
    async handle(request) {
      const url = new URL(request.url);

      if (url.pathname === "/" || url.pathname === "") {
        return Response.redirect(
          new URL(input.appPackage.manifest.entrypoint, url).toString(),
          302,
        );
      }

      if (url.pathname === runtimeBasePath + "/content") {
        try {
          authorizeRequest(request, sessionToken);
          requireCapability(input.appPackage, "read_activity_content");
          logger({
            eventType: "preview.content_read",
            detail: {
              contentPath: input.appPackage.contentPath,
            },
            occurredAt: new Date().toISOString(),
          });

          return Response.json(input.appPackage.content);
        } catch (error) {
          return runtimeReadErrorResponse(error);
        }
      }

      if (url.pathname.startsWith(runtimeBasePath + "/browser-grader/")) {
        try {
          authorizeBrowserGraderRequest(request, sessionToken);

          return await serveLocalBrowserGraderAsset({
            request,
            appPackage: input.appPackage,
            runtimeBasePath,
            sessionToken,
          });
        } catch (error) {
          return runtimeReadErrorResponse(error);
        }
      }

      if (
        url.pathname === runtimeBasePath + "/local-state" &&
        request.method === "GET"
      ) {
        try {
          authorizeRequest(request, sessionToken);
          requireCapability(input.appPackage, "read_local_state");
          logger({
            eventType: "preview.local_state.read",
            detail: {},
            occurredAt: new Date().toISOString(),
          });

          return Response.json(localState);
        } catch (error) {
          return runtimeReadErrorResponse(error);
        }
      }

      if (
        url.pathname === runtimeBasePath + "/local-state" &&
        request.method === "PUT"
      ) {
        try {
          authorizeRequest(request, sessionToken);
          requireCapability(input.appPackage, "write_local_state");
          localState = parseAttemptLocalState(await request.json());
          logger({
            eventType: "preview.local_state.write",
            detail: {
              localState,
            },
            occurredAt: new Date().toISOString(),
          });

          return new Response(null, { status: 204 });
        } catch (error) {
          return runtimeMutationErrorResponse(error);
        }
      }

      if (
        url.pathname === runtimeBasePath + "/attempt-events" &&
        request.method === "POST"
      ) {
        try {
          authorizeRequest(request, sessionToken);
          requireCapability(input.appPackage, "submit_attempt_event");
          const event = parseAttemptEvent(await request.json());
          attemptEvents.push(event);
          logger({
            eventType: "preview.attempt_event",
            detail: {
              event,
              count: attemptEvents.length,
            },
            occurredAt: new Date().toISOString(),
          });

          return new Response(null, { status: 204 });
        } catch (error) {
          return runtimeMutationErrorResponse(error);
        }
      }

      if (
        url.pathname === runtimeBasePath + "/score-proposal" &&
        request.method === "POST"
      ) {
        try {
          authorizeRequest(request, sessionToken);
          requireCapability(input.appPackage, "finalize_attempt");
          latestScoreProposal = parseScoreProposal(await request.json());
          const payload: GatewayScoreProposalAcceptedResult = {
            accepted: true,
            scoreProposal: latestScoreProposal,
          };
          logger({
            eventType: "preview.score_proposal",
            detail: {
              accepted: payload.accepted,
              scoreProposal: payload.scoreProposal,
            },
            occurredAt: new Date().toISOString(),
          });

          return Response.json(payload);
        } catch (error) {
          return runtimeMutationErrorResponse(error);
        }
      }

      if (
        url.pathname === runtimeBasePath + "/finalize" &&
        request.method === "POST"
      ) {
        try {
          authorizeRequest(request, sessionToken);
          requireCapability(input.appPackage, "finalize_attempt");
          const finalizeInput = parseFinalizeAttemptInput(await request.json());
          const scoreMaximum = latestScoreProposal?.scoreMaximum ??
            input.appPackage.reviewData.grading.maxScore ??
            100;
          const scoreGiven = latestScoreProposal?.scoreGiven ?? 0;
          const payload: GatewayFinalizeAcceptedResult = {
            accepted: true,
            attemptId: input.appPackage.fixtureData.attempt_id,
            alreadyFinalized: finalized !== null,
            completionState: finalizeInput.completionState,
            scoreGiven,
            scoreMaximum,
            gradePublished: false,
          };
          finalized = {
            completionState: finalizeInput.completionState,
          };
          logger({
            eventType: "preview.finalize",
            detail: {
              accepted: payload.accepted,
              attemptId: payload.attemptId,
              alreadyFinalized: payload.alreadyFinalized,
              completionState: payload.completionState,
              scoreGiven: payload.scoreGiven,
              scoreMaximum: payload.scoreMaximum,
              gradePublished: payload.gradePublished,
            },
            occurredAt: new Date().toISOString(),
          });

          return Response.json(payload);
        } catch (error) {
          return runtimeMutationErrorResponse(error);
        }
      }

      return await serveStaticFile({
        request,
        appPackage: input.appPackage,
        runtimeBasePath,
        bootstrap,
        previewSessionId,
      });
    },
  };
}

function buildBootstrapPayload(
  appPackage: LocalAppPackage,
  sessionToken: string,
): BootstrapPayload {
  return {
    launch: {
      user_role: appPackage.fixtureData.launch.user_role,
      course_id: appPackage.fixtureData.launch.course_id,
      ...(appPackage.fixtureData.launch.assignment_id === null
        ? {}
        : { assignment_id: appPackage.fixtureData.launch.assignment_id }),
      activity_id: appPackage.fixtureData.launch.activity_id,
      submission_mode: resolveSubmissionMode(
        appPackage.reviewData.capabilities,
      ),
    },
    app: {
      app_id: appPackage.reviewData.appId,
      version: appPackage.reviewData.version,
      capabilities: appPackage.reviewData.capabilities,
      runtime_contract_signature: "local-preview-runtime-contract",
    },
    session: {
      attempt_id: appPackage.fixtureData.attempt_id,
      token: sessionToken,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    signature: "local-preview-bootstrap-signature",
  };
}

function authorizeRequest(request: Request, expectedToken: string): void {
  const authorization = request.headers.get("authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new Error("Runtime session token is required.");
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (token === "") {
    throw new Error("Runtime session token is required.");
  }

  if (token !== expectedToken) {
    throw new Error("Runtime session token did not match the preview session.");
  }
}

function authorizeBrowserGraderRequest(
  request: Request,
  expectedToken: string,
): void {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";

  if (token !== "") {
    if (token !== expectedToken) {
      throw new Error(
        "Runtime session token did not match the preview session.",
      );
    }

    return;
  }

  authorizeRequest(request, expectedToken);
}

function requireCapability(
  appPackage: LocalAppPackage,
  capability: Capability,
): void {
  if (appPackage.reviewData.capabilities.includes(capability)) {
    return;
  }

  denyRuntimeBroker({
    category: "policyDenied",
    code: "capability_not_granted",
    message: `Preview session does not allow ${capability}.`,
    capability,
    detail: {
      appId: appPackage.reviewData.appId,
      version: appPackage.reviewData.version,
    },
  });
}

async function serveStaticFile(input: {
  request: Request;
  appPackage: LocalAppPackage;
  runtimeBasePath: string;
  bootstrap: BootstrapPayload;
  previewSessionId: string;
}): Promise<Response> {
  const url = new URL(input.request.url);
  const packagePath = trimLeadingSlash(url.pathname);
  const absolutePath = joinSnapshotPath(
    input.appPackage.rootPath,
    packagePath,
    "Requested preview file is outside the app package root.",
  );

  try {
    if (url.pathname === input.appPackage.manifest.entrypoint) {
      const runtimeBaseUrl = new URL(input.runtimeBasePath, url).toString();
      const injectedHtml = injectPreviewRuntimeBridge({
        html: input.appPackage.entrypointHtml,
        bootstrap: input.bootstrap,
        runtimeBaseUrl,
        previewSessionId: input.previewSessionId,
      });

      return new Response(injectedHtml, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    const bytes = await Deno.readFile(absolutePath);

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentTypeForPath(url.pathname),
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Preview file not found.", { status: 404 });
    }

    return new Response(errorMessage(error), { status: 500 });
  }
}

async function serveLocalBrowserGraderAsset(input: {
  request: Request;
  appPackage: LocalAppPackage;
  runtimeBasePath: string;
  sessionToken: string;
}): Promise<Response> {
  const config = readLocalBrowserGraderConfig({
    gradingMode: input.appPackage.reviewData.grading.mode,
    gradingMaxScore: input.appPackage.reviewData.grading.maxScore,
    authoring: input.appPackage.manifest.authoring ?? null,
  });

  if (config === null) {
    return new Response(
      "Browser grader is not configured for this preview package.",
      {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  const url = new URL(input.request.url);
  const prefix = `${input.runtimeBasePath}/browser-grader/`;
  const assetPath = url.pathname.slice(prefix.length);
  const runtimeBaseUrl = new URL(input.runtimeBasePath, url).toString();

  if (assetPath === "jasmine.js") {
    return new Response(buildBrowserGraderHarnessSource(), {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
      },
    });
  }

  if (assetPath === "runner.js") {
    return new Response(
      buildBrowserGraderRunnerSource({
        runtimeBaseUrl,
        reviewedSpecFiles: config.reviewedSpecFiles,
        scoreMaximum: config.scoreMaximum,
        token: input.sessionToken,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
        },
      },
    );
  }

  const reviewedMatch = assetPath.match(/^reviewed\/([0-9]+)\.js$/);

  if (!reviewedMatch?.[1]) {
    return new Response("Browser grader asset not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const specPath = config.reviewedSpecFiles.at(Number(reviewedMatch[1]));

  if (!specPath) {
    return new Response("Browser grader spec was not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const absolutePath = joinSnapshotPath(
    input.appPackage.rootPath,
    trimLeadingSlash(specPath),
    "Browser grader spec file must stay inside the package root.",
  );
  const source = await Deno.readTextFile(absolutePath);

  return new Response(source, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
    },
  });
}

function injectPreviewRuntimeBridge(input: {
  html: string;
  bootstrap: BootstrapPayload;
  runtimeBaseUrl: string;
  previewSessionId: string;
}): string {
  const scriptBody = buildRuntimeBootstrapScript({
    bootstrap: input.bootstrap,
    runtimeBaseUrl: input.runtimeBaseUrl,
    previewSessionId: input.previewSessionId,
  });
  const scriptTag = `<script>${scriptBody}</script>`;

  return injectBeforeClosingTag(input.html, "body", scriptTag);
}

function runtimeReadErrorResponse(error: unknown): Response {
  if (isRuntimeBrokerDenialError(error)) {
    return new Response(error.message, {
      status: error.status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  return new Response(errorMessage(error), {
    status: 500,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function runtimeMutationErrorResponse(error: unknown): Response {
  const result = toRuntimeBrokerResult(error);

  if (result !== null) {
    return Response.json(result, {
      status: result.denial.category === "policyDenied" ? 409 : 400,
    });
  }

  return new Response(errorMessage(error), {
    status: 500,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function contentTypeForPath(pathname: string): string {
  if (pathname.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (pathname.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (pathname.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }

  return "application/octet-stream";
}
