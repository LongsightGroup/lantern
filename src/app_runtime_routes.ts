import type { Context, Hono } from "@hono/hono";
import type { RuntimeSessionRecord } from "./lti/types.ts";
import {
  readBearerToken,
  readRuntimeFileRequest,
  requireTrimmedString,
} from "./app_request_support.ts";
import {
  errorMessage,
  statusForFinalizePublishError,
  statusForRuntimeError,
} from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";
import {
  recordRuntimeCapabilityAllowed,
  recordRuntimeRouteFailure,
  recordRuntimeScoreProposalAccepted,
  recordRuntimeSessionExited,
  recordRuntimeSessionStarted,
  requireRuntimeSession,
  resolveRuntimeSessionForAudit,
} from "./app_runtime_support.ts";
import {
  acceptAttemptEvent,
  finalizeRuntimeAttempt,
  readAttemptLocalState,
  submitScoreProposal,
  writeAttemptLocalState,
} from "./runtime/gateway.ts";
import {
  failRuntimeOutcome,
  toRuntimeBrokerResult,
} from "./runtime/gateway_errors.ts";
import {
  authorizeRuntimeSession,
  contentTypeForRuntimePath,
  loadRuntimeActivityContent,
  loadRuntimeAssetBytes,
  renderRuntimeSessionPage,
} from "./runtime/session.ts";
import {
  buildBrowserGraderHarnessSource,
  buildBrowserGraderRunnerSource,
  readReviewedBrowserGraderConfig,
} from "./runtime/browser_grader.ts";
import { readEnv } from "./platform/env.ts";
import { buildRequestAuditEnvelope } from "./request_audit.ts";
import {
  buildRuntimeSessionBaseUrl,
  requireRuntimeRequestOrigin,
} from "./runtime_origin.ts";
import { trimLeadingSlash } from "./package_review/snapshot_path.ts";

export function registerRuntimeRoutes(app: Hono, services: AppServices): void {
  app.get("/runtime/sessions/:sessionId", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    const request = buildRequestAuditEnvelope({ context });

    try {
      const runtimeOrigin = requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);
      const url = new URL(context.req.url);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          url.searchParams.get("token"),
          "Runtime session token is required.",
        ),
        expected: session,
      });
      const packageVersion = await repository.getPackageVersionById(
        session.packageVersionId,
      );

      if (!packageVersion) {
        failRuntimeOutcome({
          type: "integrity_failure",
          code: "package_version_missing",
          message:
            `Runtime session package version id ${session.packageVersionId} was not found.`,
          status: 409,
          detail: {
            packageVersionId: session.packageVersionId,
          },
        });
      }

      if (packageVersion.approvalStatus !== "approved") {
        failRuntimeOutcome({
          type: "integrity_failure",
          code: "package_version_not_approved",
          message:
            `Runtime session package version ${packageVersion.appId}@${packageVersion.version} is not approved.`,
          status: 409,
          detail: {
            packageVersionId: packageVersion.id,
          },
        });
      }

      const response = context.html(
        await renderRuntimeSessionPage(session, {
          runtimeContractSignature: packageVersion.runtimeContractSignature,
          env: services.env,
          artifactStore: services.runtimeArtifactStore,
        }),
      );

      applyRuntimeDocumentHeaders(response.headers);
      await recordRuntimeSessionStarted({
        repository,
        session,
        runtimeOrigin,
        route: "session",
      });
      return response;
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "session",
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/content", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    const request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const content = await loadRuntimeActivityContent(
        session,
        services.runtimeArtifactStore,
      );

      if (session.preview !== undefined) {
        await repository.appendPreviewEvidence({
          previewSessionId: session.preview.previewSessionId,
          eventType: "preview.content_read",
          capability: "read_activity_content",
          summary: "Loaded the app content for this test launch.",
          detail: {
            attemptId: session.attemptId,
            contentPath: session.contentPath,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      return context.json(content);
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "content",
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/local-state", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    const request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      return context.json(
        await readAttemptLocalState({
          repository,
          session,
        }),
      );
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "local-state.read",
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.put("/runtime/sessions/:sessionId/local-state", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    let request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const payload = await context.req.json();
      request = buildRequestAuditEnvelope({
        context,
        body: payload,
      });
      await writeAttemptLocalState({
        repository,
        session,
        payload,
      });

      return new Response(null, { status: 204 });
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "local-state.write",
        request,
      });
      return runtimeMutationErrorResponse(context, error);
    }
  });

  app.post("/runtime/sessions/:sessionId/attempt-events", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    let request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const payload = await context.req.json();
      request = buildRequestAuditEnvelope({
        context,
        body: payload,
      });
      const attemptEvent = await acceptAttemptEvent({
        repository,
        session,
        payload,
      });
      await repository.recordAuditEvent({
        eventType: "attempt.submitted",
        actorType: "system",
        actorId: null,
        deploymentRecordId: session.deploymentRecordId,
        packageVersionId: session.packageVersionId,
        attemptId: session.attemptId,
        lineItemBindingId: null,
        status: "accepted",
        summary: "Accepted attempt submission through the runtime gateway.",
        detail: {
          sequence: attemptEvent.sequence,
          eventType: attemptEvent.eventType,
        },
        occurredAt: new Date().toISOString(),
      });
      await recordRuntimeCapabilityAllowed({
        repository,
        session,
        capability: "submit_attempt_event",
        route: "attempt-events",
        detail: {
          eventType: attemptEvent.eventType,
          sequence: attemptEvent.sequence,
        },
      });

      return context.json({ accepted: true }, 202);
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "attempt-events",
        request,
      });
      return runtimeMutationErrorResponse(context, error);
    }
  });

  app.post("/runtime/sessions/:sessionId/score-proposal", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    let request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const payload = await context.req.json();
      request = buildRequestAuditEnvelope({
        context,
        body: payload,
      });
      const result = await submitScoreProposal({
        repository,
        session,
        payload,
      });

      if (!result.accepted) {
        return context.json(
          result,
          result.denial.category === "policyDenied" ? 409 : 400,
        );
      }

      await recordRuntimeScoreProposalAccepted({
        repository,
        session,
        scoreProposal: result.scoreProposal,
        route: "score-proposal",
      });

      return context.json(result, 202);
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "score-proposal",
        request,
      });
      return runtimeMutationErrorResponse(context, error);
    }
  });

  app.post("/runtime/sessions/:sessionId/finalize", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    let request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const payload = await context.req.json();
      request = buildRequestAuditEnvelope({
        context,
        body: payload,
      });
      const result = await finalizeRuntimeAttempt({
        repository,
        session,
        payload,
        env: services.env,
        artifactStore: services.runtimeArtifactStore,
      });

      if (result.finalizedNow) {
        await repository.recordAuditEvent({
          eventType: "attempt.finalized",
          actorType: "system",
          actorId: null,
          deploymentRecordId: session.deploymentRecordId,
          packageVersionId: session.packageVersionId,
          attemptId: session.attemptId,
          lineItemBindingId: null,
          status: "accepted",
          summary: "Finalized the durable attempt inside the runtime gateway.",
          detail: result.browserGraderResult === null
            ? {
              completionState: result.attempt.completionState,
              scoreGiven: result.score.scoreGiven,
              scoreMaximum: result.score.scoreMaximum,
            }
            : {
              completionState: result.attempt.completionState,
              scoreGiven: result.score.scoreGiven,
              scoreMaximum: result.score.scoreMaximum,
              browserGraderResult: result.browserGraderResult,
            },
          occurredAt: new Date().toISOString(),
        });
        await recordRuntimeSessionExited({
          repository,
          session,
          completionState: result.attempt.completionState,
          scoreGiven: result.score.scoreGiven,
          scoreMaximum: result.score.scoreMaximum,
          gradePublished: result.gradePublication?.status === "published",
          route: "finalize",
        });
      }

      if (result.gradePublishedNow && result.gradePublication !== null) {
        await repository.recordAuditEvent({
          eventType: "grade_publish.succeeded",
          actorType: "system",
          actorId: null,
          deploymentRecordId: session.deploymentRecordId,
          packageVersionId: session.packageVersionId,
          attemptId: session.attemptId,
          lineItemBindingId: result.lineItemBinding?.id ?? null,
          status: "succeeded",
          summary: "Published the final score to Canvas through AGS.",
          detail: {
            lineItemUrl: result.gradePublication.lineItemUrl,
            scoreGiven: result.gradePublication.scoreGiven,
            scoreMaximum: result.gradePublication.scoreMaximum,
          },
          occurredAt: new Date().toISOString(),
        });
      }

      if (result.publishError !== null) {
        await repository.recordAuditEvent({
          eventType: "grade_publish.failed",
          actorType: "system",
          actorId: null,
          deploymentRecordId: session.deploymentRecordId,
          packageVersionId: session.packageVersionId,
          attemptId: session.attemptId,
          lineItemBindingId: result.lineItemBinding?.id ?? null,
          status: "failed",
          summary: "Canvas AGS score publish failed.",
          detail: {
            code: result.publishError.code,
            message: result.publishError.message,
            request,
            ...result.publishError.detail,
          },
          occurredAt: new Date().toISOString(),
        });

        return context.text(
          result.publishError.message,
          statusForFinalizePublishError(result.publishError.code),
        );
      }

      return context.json(
        {
          accepted: true,
          alreadyFinalized: !result.finalizedNow,
          attemptId: result.attempt.attemptId,
          completionState: result.attempt.completionState,
          scoreGiven: result.score.scoreGiven,
          scoreMaximum: result.score.scoreMaximum,
          gradePublished: result.gradePublication?.status === "published",
        },
        202,
      );
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "finalize",
        request,
      });
      return runtimeMutationErrorResponse(context, error);
    }
  });

  app.get("/runtime/sessions/:sessionId/files/*", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    const request = buildRequestAuditEnvelope({ context });

    try {
      requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);
      const fileRequest = readRuntimeFileRequest(context);

      authorizeRuntimeSession({
        token: fileRequest.token,
        expected: session,
      });

      const relativePath = fileRequest.relativePath;
      const contentType = contentTypeForRuntimePath(relativePath);
      const assetBytes = await loadRuntimeAssetBytes(
        session,
        relativePath,
        services.runtimeArtifactStore,
      );
      const assetBody = new Uint8Array(assetBytes.byteLength);

      assetBody.set(assetBytes);

      return new Response(new Blob([assetBody], { type: contentType }), {
        status: 200,
        headers: buildRuntimeAssetHeaders(contentType),
      });
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "files",
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/browser-grader/*", async (context) => {
    const repository = services.getRepository();
    const sessionId = context.req.param("sessionId");
    let session: RuntimeSessionRecord | null = null;
    const request = buildRequestAuditEnvelope({ context });

    try {
      const runtimeOrigin = requireRuntimeOriginBoundary(context, services);
      session = await requireRuntimeSession(repository, sessionId);
      const url = new URL(context.req.url);
      const token = readBearerToken(context.req.header("authorization")) ??
        url.searchParams.get("token");

      authorizeRuntimeSession({
        token: requireTrimmedString(
          token,
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const packageVersion = await repository.getPackageVersionById(
        session.packageVersionId,
      );

      if (!packageVersion) {
        failRuntimeOutcome({
          type: "integrity_failure",
          code: "package_version_missing",
          message:
            `Runtime session package version id ${session.packageVersionId} was not found.`,
          status: 409,
          detail: {
            packageVersionId: session.packageVersionId,
          },
        });
      }

      const config = readReviewedBrowserGraderConfig(packageVersion);

      if (config === null) {
        return context.text(
          "Browser grader is not configured for this reviewed package.",
          404,
        );
      }

      const runtimeBaseUrl = buildRuntimeSessionBaseUrl({
        runtimeOrigin,
        sessionId,
      });
      const prefix = `/runtime/sessions/${
        encodeURIComponent(sessionId)
      }/browser-grader/`;
      const assetPath = url.pathname.slice(prefix.length);

      if (assetPath === "jasmine.js") {
        return new Response(buildBrowserGraderHarnessSource(), {
          status: 200,
          headers: buildRuntimeAssetHeaders(
            "application/javascript; charset=UTF-8",
          ),
        });
      }

      if (assetPath === "runner.js") {
        return new Response(
          buildBrowserGraderRunnerSource({
            runtimeBaseUrl,
            reviewedSpecFiles: config.reviewedSpecFiles,
            scoreMaximum: config.scoreMaximum,
            token: session.sessionToken,
          }),
          {
            status: 200,
            headers: buildRuntimeAssetHeaders(
              "application/javascript; charset=UTF-8",
            ),
          },
        );
      }

      const reviewedMatch = assetPath.match(/^reviewed\/([0-9]+)\.js$/);

      if (!reviewedMatch?.[1]) {
        return context.text("Browser grader asset not found.", 404);
      }

      const specPath = config.reviewedSpecFiles.at(Number(reviewedMatch[1]));

      if (!specPath) {
        return context.text("Browser grader spec was not found.", 404);
      }

      const assetBytes = await loadRuntimeAssetBytes(
        session,
        trimLeadingSlash(specPath),
        services.runtimeArtifactStore,
      );
      const assetBody = new Uint8Array(assetBytes.byteLength);

      assetBody.set(assetBytes);

      return new Response(
        new Blob(
          [assetBody],
          { type: contentTypeForRuntimePath(trimLeadingSlash(specPath)) },
        ),
        {
          status: 200,
          headers: buildRuntimeAssetHeaders(
            contentTypeForRuntimePath(trimLeadingSlash(specPath)),
          ),
        },
      );
    } catch (error) {
      session = await resolveRuntimeSessionForAudit(
        repository,
        session,
        sessionId,
      );
      await recordRuntimeRouteFailure({
        repository,
        session,
        error,
        route: "browser-grader",
        request,
      });
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });
}

function requireRuntimeOriginBoundary(
  context: Context,
  services: AppServices,
): string {
  try {
    return requireRuntimeRequestOrigin({
      requestUrl: context.req.url,
      forwardedHeader: context.req.header("forwarded") ?? null,
      xForwardedHost: context.req.header("x-forwarded-host") ?? null,
      xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
      configuredOrigin: readEnv("APP_RUNTIME_ORIGIN", services.env),
    });
  } catch (error) {
    const message = errorMessage(error);

    if (
      message ===
        "APP_RUNTIME_ORIGIN is required to serve reviewed runtime sessions."
    ) {
      failRuntimeOutcome({
        type: "integrity_failure",
        code: "runtime_origin_missing",
        message,
        status: 500,
        detail: {},
      });
    }

    if (
      message === "APP_RUNTIME_ORIGIN must be an absolute http or https URL."
    ) {
      failRuntimeOutcome({
        type: "integrity_failure",
        code: "runtime_origin_invalid",
        message,
        status: 500,
        detail: {},
      });
    }

    if (message === "Runtime session requests must use APP_RUNTIME_ORIGIN.") {
      failRuntimeOutcome({
        type: "deny",
        code: "runtime_origin_mismatch",
        message,
        status: 409,
        detail: {},
      });
    }

    throw error;
  }
}

function runtimeMutationErrorResponse(
  context: Context,
  error: unknown,
): Response {
  const brokerResult = toRuntimeBrokerResult(error);

  if (brokerResult !== null) {
    return context.json(brokerResult, statusForRuntimeError(error));
  }

  return context.text(errorMessage(error), statusForRuntimeError(error));
}

function applyRuntimeDocumentHeaders(headers: Headers): void {
  applyRuntimeResponseHeaders(headers);
  headers.set("content-security-policy", runtimeContentSecurityPolicy());
  headers.set("permissions-policy", runtimePermissionsPolicy());
}

function buildRuntimeAssetHeaders(contentType: string): Headers {
  const headers = new Headers({
    "content-type": contentType,
  });

  applyRuntimeResponseHeaders(headers);
  return headers;
}

function applyRuntimeResponseHeaders(headers: Headers): void {
  headers.set("cache-control", "no-store");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
}

function runtimeContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "worker-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ");
}

function runtimePermissionsPolicy(): string {
  return [
    "accelerometer=()",
    "camera=()",
    "clipboard-read=()",
    "clipboard-write=()",
    "display-capture=()",
    "fullscreen=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "publickey-credentials-get=()",
    "screen-wake-lock=()",
    "serial=()",
    "usb=()",
    "web-share=()",
    "xr-spatial-tracking=()",
  ].join(", ");
}
