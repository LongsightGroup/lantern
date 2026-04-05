import type { Context, Hono } from "@hono/hono";
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
import { requireRuntimeSession } from "./app_runtime_support.ts";
import {
  acceptAttemptEvent,
  finalizeRuntimeAttempt,
  readAttemptLocalState,
  writeAttemptLocalState,
} from "./runtime/gateway.ts";
import {
  authorizeRuntimeSession,
  contentTypeForRuntimePath,
  loadRuntimeActivityContent,
  loadRuntimeAssetBytes,
  renderRuntimeSessionPage,
} from "./runtime/session.ts";
import { requireRuntimeRequestOrigin } from "./runtime_origin.ts";

export function registerRuntimeRoutes(app: Hono, services: AppServices): void {
  app.get("/runtime/sessions/:sessionId", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );
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
        throw new Error(
          `Runtime session package version id ${session.packageVersionId} was not found.`,
        );
      }

      if (packageVersion.approvalStatus !== "approved") {
        throw new Error(
          `Runtime session package version ${packageVersion.appId}@${packageVersion.version} is not approved.`,
        );
      }

      const response = context.html(
        await renderRuntimeSessionPage(session, {
          runtimeContractSignature: packageVersion.runtimeContractSignature,
        }),
      );

      applyRuntimeDocumentHeaders(response.headers);
      return response;
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/content", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const content = await loadRuntimeActivityContent(session);

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
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/local-state", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );

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
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.put("/runtime/sessions/:sessionId/local-state", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      await writeAttemptLocalState({
        repository,
        session,
        payload: await context.req.json(),
      });

      return new Response(null, { status: 204 });
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.post("/runtime/sessions/:sessionId/attempt-events", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const attemptEvent = await acceptAttemptEvent({
        repository,
        session,
        payload: await context.req.json(),
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

      return context.json({ accepted: true }, 202);
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.post("/runtime/sessions/:sessionId/finalize", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );

      authorizeRuntimeSession({
        token: requireTrimmedString(
          readBearerToken(context.req.header("authorization")),
          "Runtime session token is required.",
        ),
        expected: session,
      });

      const result = await finalizeRuntimeAttempt({
        repository,
        session,
        payload: await context.req.json(),
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
          detail: {
            completionState: result.attempt.completionState,
            scoreGiven: result.score.scoreGiven,
            scoreMaximum: result.score.scoreMaximum,
          },
          occurredAt: new Date().toISOString(),
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
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/files/*", async (context) => {
    try {
      requireRuntimeOriginBoundary(context);
      const repository = services.getRepository();
      const session = await requireRuntimeSession(
        repository,
        context.req.param("sessionId"),
      );
      const fileRequest = readRuntimeFileRequest(context);

      authorizeRuntimeSession({
        token: fileRequest.token,
        expected: session,
      });

      const relativePath = fileRequest.relativePath;
      const contentType = contentTypeForRuntimePath(relativePath);
      const assetBytes = await loadRuntimeAssetBytes(session, relativePath);
      const assetBody = new Uint8Array(assetBytes.byteLength);

      assetBody.set(assetBytes);

      return new Response(new Blob([assetBody], { type: contentType }), {
        status: 200,
        headers: buildRuntimeAssetHeaders(contentType),
      });
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });
}

function requireRuntimeOriginBoundary(context: Context): string {
  return requireRuntimeRequestOrigin({
    requestUrl: context.req.url,
    forwardedHeader: context.req.header("forwarded") ?? null,
    xForwardedHost: context.req.header("x-forwarded-host") ?? null,
    xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
    configuredOrigin: Deno.env.get("APP_RUNTIME_ORIGIN"),
  });
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
