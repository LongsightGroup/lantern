import type { Pool } from "@db/postgres";
import { csrf } from "@hono/hono/csrf";
import { type Context, Hono } from "@hono/hono";
import type { JSONWebKeySet } from "jose";
import { createDatabasePool } from "./db/pool.ts";
import { renderControlPlanePage } from "./admin/control_plane.ts";
import { renderDeepLinkingPickerPage } from "./admin/deep_linking_picker.ts";
import {
  buildDefaultDeploymentSeed,
  type DeploymentNrpsVerificationSummary,
  renderDeploymentDetailPage,
} from "./admin/deployment_detail.ts";
import { type AdminNotice, escapeHtml } from "./admin/layout.ts";
import {
  buildCanvasConfigDocument,
  buildCanvasConfigUrl,
  listCanvasEnvironments,
  parseCanvasEnvironment,
  resolveCanvasIssuer,
} from "./lti/config.ts";
import {
  readContextMemberships,
  requestCanvasServiceAccessToken,
} from "./lti/services.ts";
import {
  type DeepLinkingResponseSubmission,
  type DeepLinkingSessionRecord,
  LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
} from "./lti/types.ts";
import { type CanvasLoginRequest, createLoginRedirect } from "./lti/login.ts";
import {
  authorizeDeepLinkingSession,
  createDeepLinkingSession,
  createReviewedPlacementFromDeepLinkingSession,
  listDeepLinkingResources,
  requireAuthorizedDeepLinkingSession,
  resolveDeepLinkingSelection,
  saveDeepLinkingSessionSelection,
  validateDeepLinkingRequest,
} from "./lti/deep_linking.ts";
import { buildDeepLinkingResponseSubmission } from "./lti/deep_linking_response.ts";
import { createRuntimeSession, validateLaunchRequest } from "./lti/launch.ts";
import { getPublicJwkSet } from "./lti/tool_key.ts";
import { renderPackageDetailPage } from "./admin/package_detail.ts";
import { renderPreviewPage } from "./admin/preview_page.ts";
import { renderPackageIndexPage } from "./admin/package_index.ts";
import {
  importDemoPackage,
  type ImportedPackageVersion,
} from "./package_review/intake.ts";
import {
  createPackageReviewRepository,
  type PackageReviewRepository,
} from "./package_review/repository.ts";
import {
  createOpsRepository,
  type OpsRepository,
  type RecordBrokerVerificationRunInput,
} from "./ops/repository.ts";
import { retryFailedGradePublication } from "./ops/service.ts";
import type {
  DeepLinkingResourceSelection,
  DeploymentRecord,
  PackageVersionRecord,
  PreviewEvidenceRecord,
  PreviewSessionRecord,
} from "./package_review/types.ts";
import { renderHomePage } from "./pages/home.ts";
import {
  authorizeRuntimeSession,
  contentTypeForRuntimePath,
  loadRuntimeActivityContent,
  loadRuntimeAssetBytes,
  renderRuntimeSessionPage,
} from "./runtime/session.ts";
import {
  launchPreviewRuntimeSession,
  preparePreviewSession,
} from "./preview/service.ts";
import {
  acceptAttemptEvent,
  finalizeRuntimeAttempt,
} from "./runtime/gateway.ts";

export interface AppServices {
  getRepository: () => PackageReviewRepository;
  getOpsRepository: () => OpsRepository;
  loadCanvasJwks: (url: string) => Promise<JSONWebKeySet>;
  importDemoPackage: (
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
}

let defaultPool: Pool | null = null;
let defaultRepository: PackageReviewRepository | null = null;
let defaultOpsRepository: OpsRepository | null = null;

export const app = createApp();

export function createApp(
  services: Partial<AppServices> = {},
): Hono {
  const resolvedServices = resolveServices(services);
  const app = new Hono();

  app.use("/admin/*", csrf());

  app.get("/", (context) => {
    return context.html(renderHomePage());
  });

  app.get("/health", (context) => {
    return context.json({ ok: true });
  });

  app.get("/lti/canvas/config.json", async (context) => {
    try {
      return context.json(await buildCanvasConfigDocument());
    } catch (error) {
      return context.json(
        {
          error: error instanceof Error ? error.message : "Config unavailable.",
        },
        statusForError(error),
      );
    }
  });

  app.get("/lti/jwks.json", async (context) => {
    try {
      return context.json(await getPublicJwkSet());
    } catch (error) {
      return context.json(
        { error: error instanceof Error ? error.message : "JWKS unavailable." },
        statusForError(error),
      );
    }
  });

  app.get("/lti/login", async (context) => {
    return await handleLoginInitiation(context, resolvedServices);
  });

  app.post("/lti/login", async (context) => {
    return await handleLoginInitiation(context, resolvedServices);
  });

  app.post("/lti/launch", async (context) => {
    const repository = resolvedServices.getRepository();
    const formData = await context.req.formData();
    const state = normalizeOptionalString(formData.get("state"));
    const idToken = normalizeOptionalString(formData.get("id_token"));

    try {
      const launch = await validateLaunchRequest({
        repository,
        state: requireTrimmedString(
          state,
          "Launch state is required.",
        ),
        idToken: requireTrimmedString(
          idToken,
          "Launch id_token is required.",
        ),
        loadJwks: resolvedServices.loadCanvasJwks,
      });
      const runtimeSession = await createRuntimeSession({
        repository,
        launch,
      });
      await repository.recordAuditEvent({
        eventType: "launch.accepted",
        actorType: "platform",
        actorId: launch.userId,
        deploymentRecordId: launch.internalDeploymentId,
        packageVersionId: launch.packageVersionId,
        attemptId: runtimeSession.attemptId,
        lineItemBindingId: null,
        status: "accepted",
        summary: "Accepted the governed Canvas launch.",
        detail: {
          internalDeploymentSlug: launch.internalDeploymentSlug,
          issuer: launch.issuer,
          clientId: launch.clientId,
          deploymentId: launch.deploymentId,
          resourceLinkId: launch.resourceLinkId,
          contextId: launch.contextId,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/runtime/sessions/${runtimeSession.sessionId}?token=${
          encodeURIComponent(runtimeSession.sessionToken)
        }`,
        303,
      );
    } catch (error) {
      await recordRejectedLaunchAudit({
        repository,
        state,
        error,
      });
      return context.text(errorMessage(error), statusForError(error));
    }
  });

  app.post("/lti/deep-linking", async (context) => {
    const repository = resolvedServices.getRepository();
    const formData = await context.req.formData();
    const state = normalizeOptionalString(formData.get("state"));
    const idToken = normalizeOptionalString(formData.get("id_token"));

    try {
      const request = await validateDeepLinkingRequest({
        repository,
        state: requireTrimmedString(
          state,
          "Deep Linking state is required.",
        ),
        idToken: requireTrimmedString(
          idToken,
          "Deep Linking id_token is required.",
        ),
        loadJwks: resolvedServices.loadCanvasJwks,
      });
      const session = await createDeepLinkingSession({
        repository,
        request,
      });

      return context.redirect(
        `/lti/deep-linking/sessions/${session.sessionId}?token=${
          encodeURIComponent(session.sessionToken)
        }`,
        303,
      );
    } catch (error) {
      return context.text(
        errorMessage(error),
        statusForDeepLinkingError(error),
      );
    }
  });

  app.get("/lti/deep-linking/sessions/:sessionId", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
      const url = new URL(context.req.url);
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param("sessionId"),
        token: requireTrimmedString(
          url.searchParams.get("token"),
          "Deep Linking session token is required.",
        ),
      });

      return await renderDeepLinkingPickerResponse({
        context,
        repository,
        session,
        token: session.sessionToken,
        notice: null,
      });
    } catch (error) {
      return context.text(
        errorMessage(error),
        statusForDeepLinkingSessionError(error),
      );
    }
  });

  app.post("/lti/deep-linking/sessions/:sessionId", async (context) => {
    const repository = resolvedServices.getRepository();
    const formData = await context.req.formData();

    try {
      const session = await requireAuthorizedDeepLinkingSession({
        repository,
        sessionId: context.req.param("sessionId"),
        token: requireTrimmedFormValue(
          formData.get("token"),
          "Deep Linking session token is required.",
        ),
      });

      try {
        const saved = await saveDeepLinkingSessionSelection({
          repository,
          session,
          selectionValue: requireTrimmedFormValue(
            formData.get("selection"),
            "Choose one reviewed resource before continuing.",
          ),
        });

        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session: saved.session,
          token: session.sessionToken,
          notice: {
            tone: "success",
            title: "Selection saved",
            detail:
              "Lantern saved the reviewed version and content path. Phase 6 will return this selection to Canvas.",
          },
        });
      } catch (error) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token: session.sessionToken,
          notice: {
            tone: "error",
            title: "Selection blocked",
            detail: errorMessage(error),
          },
          status: 400,
        });
      }
    } catch (error) {
      return context.text(
        errorMessage(error),
        statusForDeepLinkingSessionError(error),
      );
    }
  });

  app.post("/lti/deep-linking/sessions/:sessionId/submit", async (context) => {
    const repository = resolvedServices.getRepository();
    const formData = await context.req.formData();
    const sessionId = context.req.param("sessionId");
    const token = normalizeOptionalString(formData.get("token"));
    const session = await repository.getDeepLinkingSessionById(sessionId);

    if (session === null) {
      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "error",
          title: "Session verification failed",
          detail:
            "Lantern could not verify this Deep Linking session. Reopen the assignment picker from Canvas and try again.",
        }),
        404,
      );
    }

    if (token === null) {
      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "error",
          title: "Session verification failed",
          detail:
            "Lantern could not verify this Deep Linking session. Reopen the assignment picker from Canvas and try again.",
        }),
        409,
      );
    }

    try {
      authorizeDeepLinkingSession({
        token,
        expected: session,
      });
    } catch {
      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "error",
          title: "Session verification failed",
          detail:
            "Lantern could not verify this Deep Linking session. Reopen the assignment picker from Canvas and try again.",
        }),
        409,
      );
    }

    try {
      const selection = resolveDeepLinkingSelection({
        session,
        resources: await listDeepLinkingResources({
          repository,
          session,
        }),
      });

      if (selection === null) {
        return await renderDeepLinkingPickerResponse({
          context,
          repository,
          session,
          token,
          notice: {
            tone: "error",
            title: "Return blocked",
            detail: "Save one reviewed selection before returning to Canvas.",
          },
          status: 409,
        });
      }

      const deployment = await repository.getDeploymentBySlug(
        session.deploymentSlug,
      );

      if (deployment === null || deployment.id !== session.deploymentRecordId) {
        throw new Error(
          `Canvas deployment ${session.deploymentSlug} could not be loaded for this Deep Linking session.`,
        );
      }

      const packageVersion = await repository.getPackageVersionById(
        selection.packageVersionId,
      );

      if (packageVersion === null) {
        throw new Error(
          `Reviewed package version ${selection.packageVersionId} could not be loaded for the Canvas return.`,
        );
      }

      const { placement } = await createReviewedPlacementFromDeepLinkingSession(
        {
          repository,
          session,
        },
      );
      const submission = await buildDeepLinkingResponseSubmission({
        session,
        deployment,
        placement,
        packageVersion,
      });

      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "success",
          title: "Returning to Canvas",
          detail:
            "Lantern created the reviewed placement and is posting the signed Deep Linking response back to Canvas.",
          session,
          selection,
          submission,
        }),
      );
    } catch (error) {
      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "error",
          title: "Canvas return failed",
          detail: deepLinkingReturnErrorMessage(error),
          session,
          selection: resolveDeepLinkingSelection({
            session,
            resources: await listDeepLinkingResources({
              repository,
              session,
            }),
          }),
        }),
        500,
      );
    }
  });

  app.get("/runtime/sessions/:sessionId", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
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

      return context.html(await renderRuntimeSessionPage(session));
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/content", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
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
          summary:
            "Read reviewed activity content from the governed preview runtime.",
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

  app.post("/runtime/sessions/:sessionId/attempt-events", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
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
      const repository = resolvedServices.getRepository();
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

      return context.json({
        accepted: true,
        alreadyFinalized: !result.finalizedNow,
        attemptId: result.attempt.attemptId,
        completionState: result.attempt.completionState,
        scoreGiven: result.score.scoreGiven,
        scoreMaximum: result.score.scoreMaximum,
        gradePublished: result.gradePublication?.status === "published",
      }, 202);
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/runtime/sessions/:sessionId/files/*", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
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

      const relativePath = runtimeFilePathFromRequest(context);
      const contentType = contentTypeForRuntimePath(relativePath);
      const assetBytes = await loadRuntimeAssetBytes(session, relativePath);
      const assetBody = new Uint8Array(assetBytes.byteLength);

      assetBody.set(assetBytes);

      return new Response(
        new Blob([assetBody], { type: contentType }),
        {
          status: 200,
          headers: {
            "content-type": contentType,
          },
        },
      );
    } catch (error) {
      return context.text(errorMessage(error), statusForRuntimeError(error));
    }
  });

  app.get("/admin/packages", async (context) => {
    try {
      return await renderPackagesPage(context, resolvedServices);
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice("Package inventory unavailable", error),
        }),
        statusForError(error),
      );
    }
  });

  app.post("/admin/packages/verification", async (context) => {
    try {
      const verificationRun = parseBrokerVerificationRunForm(
        await context.req.formData(),
      );

      await resolvedServices.getOpsRepository().recordBrokerVerificationRun(
        verificationRun,
      );

      return context.redirect("/admin/packages", 303);
    } catch (error) {
      return await renderPackagesPage(
        context,
        resolvedServices,
        {
          notice: createErrorNotice("Verification update blocked", error),
          status: statusForVerificationError(error),
        },
      );
    }
  });

  app.post("/admin/packages/import-demo", async (context) => {
    try {
      const imported = await resolvedServices.importDemoPackage();
      const packageVersion = await resolvedServices.getRepository()
        .registerPackageVersion(imported);

      return context.redirect(
        packageDetailPath(packageVersion.appId, packageVersion.version),
        303,
      );
    } catch (error) {
      return await renderInventoryError(
        context,
        resolvedServices,
        "Demo import blocked",
        error,
      );
    }
  });

  app.get("/admin/packages/:appId/versions/:version", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
      const packageVersion = await repository.getPackageVersionByAppVersion(
        context.req.param("appId"),
        context.req.param("version"),
      );

      if (!packageVersion) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: "error",
              title: "Package version not found",
              detail:
                "Lantern could not find that exact app version in the review inventory.",
            },
          }),
          404,
        );
      }

      const history = await repository.listPackageVersionsByApp(
        packageVersion.appId,
      );

      return context.html(
        renderPackageDetailPage({
          packageVersion,
          history,
        }),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice("Package dossier unavailable", error),
        }),
        statusForError(error),
      );
    }
  });

  app.get(
    "/admin/packages/:appId/versions/:version/preview",
    async (context) => {
      const repository = resolvedServices.getRepository();
      const appId = context.req.param("appId");
      const version = context.req.param("version");

      try {
        const packageVersion = await repository.getPackageVersionByAppVersion(
          appId,
          version,
        );

        if (!packageVersion) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: {
                tone: "error",
                title: "Package version not found",
                detail:
                  "Lantern could not find that exact app version in the review inventory.",
              },
            }),
            404,
          );
        }

        const previewSession = await preparePreviewSession({
          packageVersion,
        });
        const { session, evidence } = await loadPreviewCapabilityLog({
          repository,
          packageVersionId: packageVersion.id,
        });

        return context.html(
          renderPreviewPage({
            packageVersion,
            previewSession: session ?? previewSession,
            previewEvidence: evidence,
          }),
        );
      } catch (error) {
        const packageVersion = await repository.getPackageVersionByAppVersion(
          appId,
          version,
        );

        if (!packageVersion) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: createErrorNotice("Preview launch unavailable", error),
            }),
            statusForError(error),
          );
        }

        const history = await repository.listPackageVersionsByApp(appId);

        return context.html(
          renderPackageDetailPage({
            packageVersion,
            history,
            notice: createErrorNotice("Preview launch unavailable", error),
          }),
          statusForError(error),
        );
      }
    },
  );

  app.post(
    "/admin/packages/:appId/versions/:version/preview",
    async (context) => {
      const repository = resolvedServices.getRepository();
      const appId = context.req.param("appId");
      const version = context.req.param("version");

      try {
        const packageVersion = await repository.getPackageVersionByAppVersion(
          appId,
          version,
        );

        if (!packageVersion) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: {
                tone: "error",
                title: "Package version not found",
                detail:
                  "Lantern could not find that exact app version in the review inventory.",
              },
            }),
            404,
          );
        }

        const launched = await launchPreviewRuntimeSession({
          repository,
          packageVersion,
        });

        await repository.recordAuditEvent({
          eventType: "preview.launch",
          actorType: "user",
          actorId: null,
          deploymentRecordId: null,
          packageVersionId: packageVersion.id,
          attemptId: launched.runtimeSession.attemptId,
          lineItemBindingId: null,
          status: "succeeded",
          summary: "Launched a governed preview runtime session.",
          detail: {
            previewSessionId: launched.previewSession.sessionId,
            runtimeSessionId: launched.runtimeSession.sessionId,
            appId: packageVersion.appId,
            packageVersion: packageVersion.version,
          },
          occurredAt: new Date().toISOString(),
        });

        return context.redirect(
          `/runtime/sessions/${launched.runtimeSession.sessionId}?token=${
            encodeURIComponent(launched.runtimeSession.sessionToken)
          }`,
          303,
        );
      } catch (error) {
        const packageVersion = await repository.getPackageVersionByAppVersion(
          appId,
          version,
        );

        if (!packageVersion) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: createErrorNotice("Preview launch blocked", error),
            }),
            statusForError(error),
          );
        }

        let previewSession = null;

        try {
          previewSession = await preparePreviewSession({
            packageVersion,
          });
        } catch {
          previewSession = null;
        }

        if (previewSession !== null) {
          const { session, evidence } = await loadPreviewCapabilityLog({
            repository,
            packageVersionId: packageVersion.id,
          });

          return context.html(
            renderPreviewPage({
              packageVersion,
              previewSession: session ?? previewSession,
              previewEvidence: evidence,
              notice: createErrorNotice("Preview launch blocked", error),
            }),
            statusForError(error),
          );
        }

        const history = await repository.listPackageVersionsByApp(appId);

        return context.html(
          renderPackageDetailPage({
            packageVersion,
            history,
            notice: createErrorNotice("Preview launch blocked", error),
          }),
          statusForError(error),
        );
      }
    },
  );

  app.post("/admin/packages/:id/approve", async (context) => {
    return await handleReviewDecision(
      context,
      resolvedServices,
      "approve",
    );
  });

  app.post("/admin/packages/:id/reject", async (context) => {
    return await handleReviewDecision(
      context,
      resolvedServices,
      "reject",
    );
  });

  app.get("/admin/packages/:appId/deployment", async (context) => {
    try {
      const repository = resolvedServices.getRepository();
      const detail = await loadDeploymentDetailState(
        repository,
        context.req.param("appId"),
      );
      const controlPlaneDetail = detail.deployment === null
        ? null
        : await resolvedServices.getOpsRepository()
          .getControlPlaneDeploymentDetail(
            detail.deployment.id,
          );

      return context.html(
        renderDeploymentDetailPage({
          appId: context.req.param("appId"),
          appTitle: detail.appTitle,
          history: detail.history,
          deployment: detail.deployment,
          nrpsVerification: detail.nrpsVerification,
          controlPlaneDetail,
          canvasConfigUrl: detail.canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: detail.canvasConfigUrl.notice,
        }),
      );
    } catch (error) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice("Deployment page unavailable", error),
        }),
        statusForError(error),
      );
    }
  });

  app.post(
    "/admin/packages/:appId/deployment/verify-roster",
    async (context) => {
      const appId = context.req.param("appId");
      const repository = resolvedServices.getRepository();

      try {
        const detail = await loadDeploymentDetailState(repository, appId);

        if (detail.deployment === null) {
          throw new Error(
            "Save the Canvas binding and exact deployment before verifying roster access.",
          );
        }

        if (detail.deployment.binding === null) {
          throw new Error(
            "Canvas deployment binding is required before roster verification can run.",
          );
        }

        const latestSession = await repository
          .getLatestRuntimeSessionByDeploymentId(
            detail.deployment.id,
          );

        if (latestSession === null) {
          throw new Error(
            "Launch the deployment from Canvas once before verifying roster access.",
          );
        }

        if (latestSession.services.nrps === null) {
          throw new Error(
            "Launch did not provide NRPS service context for this deployment.",
          );
        }

        const token = await requestCanvasServiceAccessToken({
          issuer: detail.deployment.binding.issuer,
          clientId: detail.deployment.binding.clientId,
          scopes: [LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE],
        });
        const members = await readContextMemberships({
          accessToken: token.accessToken,
          contextMembershipsUrl:
            latestSession.services.nrps.contextMembershipsUrl,
        });

        await repository.recordAuditEvent({
          eventType: "deployment.nrps_verified",
          actorType: "system",
          actorId: null,
          deploymentRecordId: detail.deployment.id,
          packageVersionId: detail.deployment.enabledPackageVersionId,
          attemptId: latestSession.attemptId,
          lineItemBindingId: null,
          status: "succeeded",
          summary:
            "Read Canvas roster memberships through the launch-scoped NRPS service.",
          detail: {
            contextId: latestSession.launch.courseId,
            memberCount: members.length,
          },
          occurredAt: new Date().toISOString(),
        });

        return context.redirect(`/admin/packages/${appId}/deployment`, 303);
      } catch (error) {
        const detail = await loadDeploymentDetailStateSafe(repository, appId);

        if (detail.deployment !== null) {
          await repository.recordAuditEvent({
            eventType: "deployment.nrps_verified",
            actorType: "system",
            actorId: null,
            deploymentRecordId: detail.deployment.id,
            packageVersionId: detail.deployment.enabledPackageVersionId,
            attemptId: null,
            lineItemBindingId: null,
            status: "failed",
            summary: "Canvas roster verification failed.",
            detail: {
              message: errorMessage(error),
            },
            occurredAt: new Date().toISOString(),
          });
        }
        const nrpsVerification = detail.deployment === null
          ? detail.nrpsVerification
          : await getLatestNrpsVerification(repository, detail.deployment.id);

        if (detail.history.length === 0) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: createErrorNotice("Deployment page unavailable", error),
            }),
            statusForNrpsError(error),
          );
        }

        return context.html(
          renderDeploymentDetailPage({
            appId,
            appTitle: detail.appTitle,
            history: detail.history,
            deployment: detail.deployment,
            nrpsVerification,
            canvasConfigUrl: detail.canvasConfigUrl.url,
            supportedCanvasEnvironments: listCanvasEnvironments(),
            notice: combineNotices(
              detail.canvasConfigUrl.notice,
              createErrorNotice("Roster verification failed", error),
            ),
          }),
          statusForNrpsError(error),
        );
      }
    },
  );

  app.post(
    "/admin/packages/:appId/deployment/retry-grade-publish",
    async (context) => {
      const appId = context.req.param("appId");
      const repository = resolvedServices.getRepository();
      const opsRepository = resolvedServices.getOpsRepository();
      let attemptId: string | null = null;

      try {
        const detail = await loadDeploymentDetailState(repository, appId);

        if (detail.deployment === null) {
          throw new Error(
            "Save the Canvas binding and exact deployment before retrying a grade publish.",
          );
        }

        const formData = await context.req.formData();
        attemptId = requireTrimmedFormValue(
          formData.get("attemptId"),
          "Retry attempt is required.",
        );
        const retryResult = await retryFailedGradePublication({
          repository: {
            getRetryableGradePublicationLookup: (candidateAttemptId) =>
              opsRepository.getRetryableGradePublicationLookup(
                candidateAttemptId,
              ),
            updateGradePublication: (input) =>
              repository.updateGradePublication(input),
          },
          attemptId,
        });

        if (retryResult.publication.status === "published") {
          await repository.recordAuditEvent({
            eventType: "grade_publish.retry_succeeded",
            actorType: "user",
            actorId: null,
            deploymentRecordId: detail.deployment.id,
            packageVersionId: detail.deployment.enabledPackageVersionId,
            attemptId: retryResult.attemptId,
            lineItemBindingId: null,
            status: "succeeded",
            summary:
              "Retried the failed Canvas AGS score publish from the control plane.",
            detail: {
              attemptId: retryResult.attemptId,
              code: "retry_succeeded",
            },
            occurredAt: new Date().toISOString(),
          });

          return context.redirect(`/admin/packages/${appId}/deployment`, 303);
        }

        await repository.recordAuditEvent({
          eventType: "grade_publish.retry_failed",
          actorType: "user",
          actorId: null,
          deploymentRecordId: detail.deployment.id,
          packageVersionId: detail.deployment.enabledPackageVersionId,
          attemptId: retryResult.attemptId,
          lineItemBindingId: null,
          status: "failed",
          summary: "Retrying the Canvas AGS score publish failed.",
          detail: {
            attemptId: retryResult.attemptId,
            code: retryResult.publication.errorCode ?? "score_publish_failed",
          },
          occurredAt: new Date().toISOString(),
        });

        const controlPlaneDetail = await opsRepository
          .getControlPlaneDeploymentDetail(
            detail.deployment.id,
          );

        return context.html(
          renderDeploymentDetailPage({
            appId,
            appTitle: detail.appTitle,
            history: detail.history,
            deployment: detail.deployment,
            nrpsVerification: detail.nrpsVerification,
            controlPlaneDetail,
            canvasConfigUrl: detail.canvasConfigUrl.url,
            supportedCanvasEnvironments: listCanvasEnvironments(),
            notice: combineNotices(
              detail.canvasConfigUrl.notice,
              createErrorNotice(
                "Grade publish retry failed",
                new Error(
                  retryResult.publication.errorCode ??
                    "Canvas AGS score publish failed.",
                ),
              ),
            ),
          }),
          500,
        );
      } catch (error) {
        const detail = await loadDeploymentDetailStateSafe(repository, appId);

        if (detail.deployment !== null) {
          await repository.recordAuditEvent({
            eventType: "grade_publish.retry_failed",
            actorType: "user",
            actorId: null,
            deploymentRecordId: detail.deployment.id,
            packageVersionId: detail.deployment.enabledPackageVersionId,
            attemptId,
            lineItemBindingId: null,
            status: "failed",
            summary: "Retrying the Canvas AGS score publish failed.",
            detail: {
              attemptId,
              code: normalizeRetryFailureCode(error),
              message: errorMessage(error),
            },
            occurredAt: new Date().toISOString(),
          });
        }

        if (detail.history.length === 0) {
          return context.html(
            renderPackageIndexPage({
              versions: [],
              notice: createErrorNotice("Deployment page unavailable", error),
            }),
            statusForRetryPublishError(error),
          );
        }

        const controlPlaneDetail = detail.deployment === null
          ? null
          : await opsRepository.getControlPlaneDeploymentDetail(
            detail.deployment.id,
          );

        return context.html(
          renderDeploymentDetailPage({
            appId,
            appTitle: detail.appTitle,
            history: detail.history,
            deployment: detail.deployment,
            nrpsVerification: detail.nrpsVerification,
            controlPlaneDetail,
            canvasConfigUrl: detail.canvasConfigUrl.url,
            supportedCanvasEnvironments: listCanvasEnvironments(),
            notice: combineNotices(
              detail.canvasConfigUrl.notice,
              createErrorNotice("Grade publish retry failed", error),
            ),
          }),
          statusForRetryPublishError(error),
        );
      }
    },
  );

  app.post("/admin/packages/:appId/deployment/pin", async (context) => {
    const appId = context.req.param("appId");

    try {
      const repository = resolvedServices.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: "error",
              title: "Version picker unavailable",
              detail:
                "Import the app package before you attempt to save a deployment pin.",
            },
          }),
          404,
        );
      }

      const formData = await context.req.formData();
      const selectedId = Number(formData.get("packageVersionId"));
      const appTitle = history[0]?.title ?? history[0]?.appId ?? "Package";
      const seed = buildDefaultDeploymentSeed(appId, appTitle);

      const deployment = await repository.pinDeploymentVersion({
        slug: seed.slug,
        label: seed.label,
        appId,
        packageVersionId: selectedId,
      });
      await repository.recordAuditEvent({
        eventType: "deployment.version_pinned",
        actorType: "user",
        actorId: null,
        deploymentRecordId: deployment.id,
        packageVersionId: deployment.enabledPackageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: "succeeded",
        summary: "Pinned an exact reviewed package version for deployment.",
        detail: {
          deploymentSlug: deployment.slug,
          packageVersionId: deployment.enabledPackageVersionId,
          packageVersion: deployment.enabledPackageVersion,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment`, 303);
    } catch (error) {
      return await renderDeploymentError(
        context,
        resolvedServices,
        appId,
        "Version pin blocked",
        error,
      );
    }
  });

  app.post("/admin/packages/:appId/deployment/install", async (context) => {
    const appId = context.req.param("appId");

    try {
      buildCanvasConfigUrl();

      const repository = resolvedServices.getRepository();
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: "error",
              title: "Canvas install unavailable",
              detail:
                "Import the app package before you attempt to save the Canvas binding.",
            },
          }),
          404,
        );
      }

      const formData = await context.req.formData();
      const appTitle = history[0]?.title ?? history[0]?.appId ?? "Package";
      const seed = buildDefaultDeploymentSeed(appId, appTitle);
      const canvasEnvironment = parseCanvasEnvironment(
        formData.get("canvasEnvironment"),
      );
      const clientId = requireTrimmedFormValue(
        formData.get("clientId"),
        "Canvas Client ID is required.",
      );
      const deploymentId = requireTrimmedFormValue(
        formData.get("deploymentId"),
        "Canvas Deployment ID is required.",
      );

      const deployment = await repository.saveDeploymentBinding({
        slug: seed.slug,
        label: seed.label,
        appId,
        binding: {
          canvasEnvironment,
          issuer: resolveCanvasIssuer(canvasEnvironment),
          clientId,
          deploymentId,
        },
      });
      await repository.recordAuditEvent({
        eventType: "deployment.binding_saved",
        actorType: "user",
        actorId: null,
        deploymentRecordId: deployment.id,
        packageVersionId: deployment.enabledPackageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: "succeeded",
        summary: "Saved the Canvas deployment binding.",
        detail: {
          deploymentSlug: deployment.slug,
          canvasEnvironment,
          issuer: resolveCanvasIssuer(canvasEnvironment),
          clientId,
          deploymentId,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(`/admin/packages/${appId}/deployment`, 303);
    } catch (error) {
      return await renderDeploymentError(
        context,
        resolvedServices,
        appId,
        "Canvas install blocked",
        error,
      );
    }
  });

  return app;
}

function resolveServices(services: Partial<AppServices>): AppServices {
  const getRepository = services.getRepository ?? getDefaultRepository;

  return {
    getRepository,
    getOpsRepository: services.getOpsRepository ??
      (() => {
        const repository = getRepository();

        return isOpsRepository(repository)
          ? repository
          : getDefaultOpsRepository();
      }),
    loadCanvasJwks: services.loadCanvasJwks ?? defaultLoadCanvasJwks,
    importDemoPackage: services.importDemoPackage ?? importDemoPackage,
  };
}

function getDefaultRepository(): PackageReviewRepository {
  if (defaultRepository === null) {
    defaultRepository = createPackageReviewRepository(getDefaultPool());
  }

  return defaultRepository;
}

function getDefaultOpsRepository(): OpsRepository {
  if (defaultOpsRepository === null) {
    defaultOpsRepository = createOpsRepository(getDefaultPool());
  }

  return defaultOpsRepository;
}

async function defaultLoadCanvasJwks(url: string): Promise<JSONWebKeySet> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Canvas JWKS fetch failed for ${url}.`);
  }

  return await response.json();
}

function getDefaultPool(): Pool {
  if (defaultPool === null) {
    defaultPool = createDatabasePool();
  }

  return defaultPool;
}

function isOpsRepository(
  repository: PackageReviewRepository,
): repository is PackageReviewRepository & OpsRepository {
  return typeof (repository as Partial<OpsRepository>)
        .listControlPlaneDeployments ===
      "function" &&
    typeof (repository as Partial<OpsRepository>)
        .getLatestBrokerVerificationStatus ===
      "function" &&
    typeof (repository as Partial<OpsRepository>)
        .recordBrokerVerificationRun === "function" &&
    typeof (repository as Partial<OpsRepository>)
        .getRetryableGradePublicationLookup === "function";
}

async function handleReviewDecision(
  context: Context,
  services: AppServices,
  decision: "approve" | "reject",
) {
  const id = Number(context.req.param("id"));

  try {
    const formData = await context.req.formData();
    const reviewNotes = normalizeOptionalString(formData.get("reviewNotes"));
    const repository = services.getRepository();
    const packageVersion = decision === "approve"
      ? await repository.approvePackageVersion({ id, reviewNotes })
      : await repository.rejectPackageVersion({ id, reviewNotes });
    await repository.recordAuditEvent({
      eventType: decision === "approve"
        ? "package.approved"
        : "package.rejected",
      actorType: "user",
      actorId: null,
      deploymentRecordId: null,
      packageVersionId: packageVersion.id,
      attemptId: null,
      lineItemBindingId: null,
      status: "succeeded",
      summary: decision === "approve"
        ? "Approved the reviewed package version."
        : "Rejected the reviewed package version.",
      detail: {
        appId: packageVersion.appId,
        version: packageVersion.version,
        reviewNotes,
      },
      occurredAt: new Date().toISOString(),
    });

    return context.redirect(
      packageDetailPath(packageVersion.appId, packageVersion.version),
      303,
    );
  } catch (error) {
    return await renderPackageDetailError(
      context,
      services,
      id,
      decision === "approve" ? "Approval blocked" : "Rejection blocked",
      error,
    );
  }
}

async function renderInventoryError(
  context: Context,
  services: AppServices,
  title: string,
  error: unknown,
) {
  let versions: PackageVersionRecord[] = [];

  try {
    versions = await services.getRepository().listPackageVersions();
  } catch {
    versions = [];
  }

  return context.html(
    renderPackageIndexPage({
      versions,
      notice: createErrorNotice(title, error),
    }),
    statusForError(error),
  );
}

async function renderPackagesPage(
  context: Context,
  services: AppServices,
  input: {
    notice?: AdminNotice | null;
    status?: 200 | 400 | 500;
  } = {},
) {
  const versions = await services.getRepository().listPackageVersions();

  if (versions.length === 0) {
    return context.html(
      renderPackageIndexPage({
        versions,
        notice: input.notice ?? null,
      }),
      input.status ?? 200,
    );
  }

  const [deployments, latestBrokerVerification] = await Promise.all([
    services.getOpsRepository().listControlPlaneDeployments(),
    services.getOpsRepository().getLatestBrokerVerificationStatus(),
  ]);

  return context.html(
    renderControlPlanePage({
      deployments,
      latestBrokerVerification,
      notice: input.notice ?? null,
    }),
    input.status ?? 200,
  );
}

async function renderPackageDetailError(
  context: Context,
  services: AppServices,
  id: number,
  title: string,
  error: unknown,
) {
  try {
    const repository = services.getRepository();
    const packageVersion = await repository.getPackageVersionById(id);

    if (!packageVersion) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice(title, error),
        }),
        statusForError(error),
      );
    }

    const history = await repository.listPackageVersionsByApp(
      packageVersion.appId,
    );

    return context.html(
      renderPackageDetailPage({
        packageVersion,
        history,
        notice: createErrorNotice(title, error),
      }),
      statusForError(error),
    );
  } catch {
    return context.html(
      renderPackageIndexPage({
        versions: [],
        notice: createErrorNotice(title, error),
      }),
      statusForError(error),
    );
  }
}

async function renderDeploymentError(
  context: Context,
  services: AppServices,
  appId: string,
  title: string,
  error: unknown,
) {
  try {
    const repository = services.getRepository();
    const history = await repository.listPackageVersionsByApp(appId);

    if (history.length === 0) {
      return context.html(
        renderPackageIndexPage({
          versions: [],
          notice: createErrorNotice(title, error),
        }),
        statusForError(error),
      );
    }

    const appTitle = history[0]?.title ?? history[0]?.appId ?? "Package";
    const seed = buildDefaultDeploymentSeed(appId, appTitle);
    const deployment = await repository.getDeploymentBySlug(seed.slug);
    const canvasConfigUrl = getCanvasConfigUrlNoticeSafe();

    return context.html(
      renderDeploymentDetailPage({
        appId,
        appTitle,
        history,
        deployment,
        canvasConfigUrl: canvasConfigUrl.url,
        supportedCanvasEnvironments: listCanvasEnvironments(),
        notice: combineNotices(
          canvasConfigUrl.notice,
          createErrorNotice(title, error),
        ),
      }),
      statusForError(error),
    );
  } catch {
    return context.html(
      renderPackageIndexPage({
        versions: [],
        notice: createErrorNotice(title, error),
      }),
      statusForError(error),
    );
  }
}

async function handleLoginInitiation(
  context: Context,
  services: AppServices,
) {
  try {
    const loginRequest = await readCanvasLoginRequest(context);
    const result = await createLoginRedirect({
      repository: services.getRepository(),
      loginRequest,
    });

    return context.redirect(result.location, 302);
  } catch (error) {
    return context.text(errorMessage(error), statusForError(error));
  }
}

async function requireRuntimeSession(
  repository: PackageReviewRepository,
  sessionId: string,
) {
  const session = await repository.getRuntimeSessionById(sessionId);

  if (!session) {
    throw new Error(`Runtime session ${sessionId} was not found.`);
  }

  return session;
}

async function renderDeepLinkingPickerResponse(input: {
  context: Context;
  repository: PackageReviewRepository;
  session: DeepLinkingSessionRecord;
  token: string;
  notice: AdminNotice | null;
  status?: 200 | 400 | 409;
}) {
  const resources = await listDeepLinkingResources({
    repository: input.repository,
    session: input.session,
  });
  const selection = resolveDeepLinkingSelection({
    session: input.session,
    resources,
  });

  return input.context.html(
    renderDeepLinkingPickerPage({
      sessionId: input.session.sessionId,
      token: input.token,
      session: input.session,
      resources,
      selection,
      notice: input.notice,
    }),
    input.status ?? 200,
  );
}

function renderDeepLinkingSubmitStatusPage(input: {
  tone: "success" | "error";
  title: string;
  detail: string;
  session?: Pick<
    DeepLinkingSessionRecord,
    "appId" | "contextTitle" | "deploymentSlug"
  >;
  selection?: DeepLinkingResourceSelection | null;
  submission?: DeepLinkingResponseSubmission;
}): string {
  const surfaceClass = input.tone === "success" ? "success" : "error";
  const session = input.session ?? null;
  const selection = input.selection ?? null;
  const submission = input.submission ?? null;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        --font: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        --bg: linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
        --surface: #ffffff;
        --surface-soft: #f8fafc;
        --ink: #0f172a;
        --muted: #475569;
        --line: #d9e2ec;
        --success: #166534;
        --success-soft: #e8f5eb;
        --error: #b42318;
        --error-soft: #fef3f2;
        --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
      }

      body {
        font: 14px/1.55 var(--font);
        color: var(--ink);
        background: var(--bg);
        padding: 24px;
      }

      main {
        max-width: 760px;
        margin: 0 auto;
      }

      .shell {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(217, 226, 236, 0.9);
        border-radius: 28px;
        padding: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }

      .status-card,
      .summary-card {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: var(--surface);
      }

      .status-card.success {
        background: linear-gradient(180deg, rgba(232, 245, 235, 0.72), #ffffff);
        border-color: rgba(22, 101, 52, 0.16);
      }

      .status-card.error {
        background: linear-gradient(180deg, rgba(254, 243, 242, 0.82), #ffffff);
        border-color: rgba(180, 35, 24, 0.16);
      }

      .eyebrow {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: ${
    surfaceClass === "success" ? "var(--success)" : "var(--error)"
  };
      }

      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.4rem);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }

      p {
        margin: 12px 0 0;
        color: var(--muted);
      }

      .layout {
        display: grid;
        gap: 16px;
        margin-top: 16px;
      }

      .summary-label {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .summary-item {
        margin: 0;
      }

      .summary-item strong {
        display: block;
        margin-bottom: 4px;
      }

      .button-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 600;
        color: white;
        background: var(--success);
        cursor: pointer;
      }

      .helper-copy {
        margin-top: 12px;
      }

      .resource-path {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      @media (max-width: 720px) {
      body {
        padding: 12px;
      }

        .shell {
          padding: 12px;
          border-radius: 20px;
        }

        .status-card,
        .summary-card {
          padding: 16px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <section class="status-card ${surfaceClass}">
          <p class="eyebrow">Lantern Deep Linking</p>
          <h1>${escapeHtml(input.title)}</h1>
          <p>${escapeHtml(input.detail)}</p>
        </section>
        <div class="layout">
          ${
    session === null ? "" : `<section class="summary-card">
          <p class="summary-label">Session</p>
          <p class="summary-item"><strong>Course context</strong>${
      escapeHtml(session.contextTitle ?? "Canvas context")
    }</p>
          <p class="summary-item"><strong>Bound app</strong>${
      escapeHtml(session.appId)
    }</p>
          <p class="summary-item"><strong>Deployment</strong>${
      escapeHtml(session.deploymentSlug)
    }</p>
        </section>`
  }
          ${
    selection === null ? "" : `<section class="summary-card">
          <p class="summary-label">Saved reviewed selection</p>
          <p class="summary-item"><strong>${
      escapeHtml(
        selection.contentTitle ??
          `${selection.packageVersion} reviewed activity`,
      )
    }</strong>${escapeHtml(selection.packageVersion)}</p>
          <p class="summary-item resource-path">${
      escapeHtml(selection.contentPath)
    }</p>
        </section>`
  }
          ${
    submission === null ? "" : `<section class="summary-card">
          <p class="summary-label">Canvas return</p>
          <p class="summary-item"><strong>Signed Deep Linking response</strong>Lantern is posting the reviewed placement back to Canvas now.</p>
          <form id="canvas-return-form" method="post" action="${
      escapeHtml(submission.returnUrl)
    }">
            ${
      Object.entries(submission.formFields).map(([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${
          escapeHtml(value)
        }">`
      ).join("")
    }
            <button type="submit" class="button-primary">Return to Canvas</button>
          </form>
          <p class="helper-copy">If Canvas does not resume automatically, use the button above.</p>
        </section>`
  }
        </div>
      </div>
      ${
    submission === null ? "" : `<script>
        window.addEventListener("load", () => {
          document.getElementById("canvas-return-form")?.submit();
        }, { once: true });
      </script>`
  }
    </main>
  </body>
</html>`;
}

function deepLinkingReturnErrorMessage(error: unknown): string {
  const message = errorMessage(error);

  if (
    message.includes("APP_ORIGIN") ||
    message.includes("LTI_TOOL_PRIVATE_JWK")
  ) {
    return "Lantern could not prepare the signed Canvas return. Contact an operator and try again.";
  }

  return message;
}

function createErrorNotice(title: string, error: unknown): AdminNotice {
  const message = errorMessage(error);
  const items = message.includes("; ") ? message.split("; ") : [];

  return {
    tone: "error",
    title,
    detail: items.length > 0
      ? "Resolve the listed issues and try again."
      : message,
    ...(items.length > 0 ? { items } : {}),
  };
}

function statusForError(error: unknown): 409 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("already exists") ||
    error.message.includes("cannot change state") ||
    error.message.includes("Only approved") ||
    error.message.includes("does not belong") ||
    error.message.includes("not found") ||
    error.message.includes("required") ||
    error.message.includes("belongs to another deployment") ||
    error.message.includes("Choose one supported Canvas environment") ||
    error.message.includes("Canvas deployment") ||
    error.message.includes("Canvas issuer") ||
    error.message.includes("Login state") ||
    error.message.includes("Launch ") ||
    error.message.includes("Preview ")
  ) {
    return 409;
  }

  return 500;
}

function statusForDeepLinkingError(error: unknown): 400 | 500 {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (
    error.message.includes("required") ||
    error.message.includes("Unsupported") ||
    error.message.includes("Canvas deployment") ||
    error.message.includes("Canvas issuer") ||
    error.message.includes("Login state") ||
    error.message.includes("Deep Linking")
  ) {
    return 400;
  }

  return 500;
}

function statusForDeepLinkingSessionError(error: unknown): 404 | 409 | 500 {
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

function statusForVerificationError(error: unknown): 400 | 500 {
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

function statusForRuntimeError(error: unknown): 404 | 409 | 500 {
  if (!(error instanceof Error)) {
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

function statusForFinalizePublishError(code: string): 409 | 500 {
  if (
    code === "missing_binding" ||
    code === "missing_ags_context" ||
    code === "missing_ags_scope"
  ) {
    return 409;
  }

  return 500;
}

function statusForNrpsError(error: unknown): 409 | 500 {
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

function statusForRetryPublishError(error: unknown): 409 | 500 {
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

function normalizeOptionalString(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requireTrimmedFormValue(
  value: FormDataEntryValue | null,
  message: string,
): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(message);
  }

  return trimmed;
}

function parseBrokerVerificationRunForm(
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
    source,
    scope: "canvasLti13LaunchAgsNrps",
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

function parseVerificationCheckedAt(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error("Checked-at timestamp must be a valid ISO-8601 value.");
  }

  return timestamp.toISOString();
}

function getCanvasConfigUrlNoticeSafe(): {
  url: string | null;
  notice: AdminNotice | null;
} {
  try {
    return {
      url: buildCanvasConfigUrl(),
      notice: null,
    };
  } catch (error) {
    return {
      url: null,
      notice: createErrorNotice("Canvas config unavailable", error),
    };
  }
}

async function loadDeploymentDetailState(
  repository: PackageReviewRepository,
  appId: string,
): Promise<{
  history: PackageVersionRecord[];
  appTitle: string;
  deployment: DeploymentRecord | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: {
    url: string | null;
    notice: AdminNotice | null;
  };
}> {
  const history = await repository.listPackageVersionsByApp(appId);

  if (history.length === 0) {
    throw new Error(
      "Import a package version first so Lantern has an exact app to pin.",
    );
  }

  const appTitle = history[0]?.title ?? history[0]?.appId ?? "Package";
  const seed = buildDefaultDeploymentSeed(appId, appTitle);
  const deployment = await repository.getDeploymentBySlug(seed.slug);
  const nrpsVerification = deployment === null
    ? null
    : await getLatestNrpsVerification(repository, deployment.id);

  return {
    history,
    appTitle,
    deployment,
    nrpsVerification,
    canvasConfigUrl: getCanvasConfigUrlNoticeSafe(),
  };
}

async function loadDeploymentDetailStateSafe(
  repository: PackageReviewRepository,
  appId: string,
): Promise<{
  history: PackageVersionRecord[];
  appTitle: string;
  deployment: DeploymentRecord | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: {
    url: string | null;
    notice: AdminNotice | null;
  };
}> {
  try {
    return await loadDeploymentDetailState(repository, appId);
  } catch {
    return {
      history: [],
      appTitle: "Package",
      deployment: null,
      nrpsVerification: null,
      canvasConfigUrl: getCanvasConfigUrlNoticeSafe(),
    };
  }
}

async function getLatestNrpsVerification(
  repository: PackageReviewRepository,
  deploymentRecordId: number,
): Promise<DeploymentNrpsVerificationSummary | null> {
  const events = await repository.listAuditEventsByEventType(
    "deployment.nrps_verified",
  );
  const event = [...events].reverse().find((candidate) =>
    candidate.deploymentRecordId === deploymentRecordId
  );

  if (!event) {
    return null;
  }

  const memberCount = typeof event.detail.memberCount === "number"
    ? event.detail.memberCount
    : null;
  const contextId = typeof event.detail.contextId === "string"
    ? event.detail.contextId
    : null;

  return {
    status: event.status === "succeeded" ? "succeeded" : "failed",
    checkedAt: event.occurredAt,
    contextId,
    memberCount,
  };
}

async function readCanvasLoginRequest(
  context: Context,
): Promise<CanvasLoginRequest> {
  if (context.req.method === "GET") {
    const url = new URL(context.req.url);

    return {
      iss: requireTrimmedString(
        url.searchParams.get("iss"),
        "Canvas issuer is required.",
      ),
      loginHint: requireTrimmedString(
        url.searchParams.get("login_hint"),
        "Canvas login_hint is required.",
      ),
      targetLinkUri: requireTrimmedString(
        url.searchParams.get("target_link_uri"),
        "Canvas target_link_uri is required.",
      ),
      clientId: requireTrimmedString(
        url.searchParams.get("client_id"),
        "Canvas client_id is required.",
      ),
      deploymentId: resolveLoginDeploymentId({
        primary: url.searchParams.get("deployment_id"),
        secondary: url.searchParams.get("lti_deployment_id"),
      }),
      ltiMessageHint: normalizeNullableString(
        url.searchParams.get("lti_message_hint"),
      ),
    };
  }

  const formData = await context.req.formData();

  return {
    iss: requireTrimmedFormValue(
      formData.get("iss"),
      "Canvas issuer is required.",
    ),
    loginHint: requireTrimmedFormValue(
      formData.get("login_hint"),
      "Canvas login_hint is required.",
    ),
    targetLinkUri: requireTrimmedFormValue(
      formData.get("target_link_uri"),
      "Canvas target_link_uri is required.",
    ),
    clientId: requireTrimmedFormValue(
      formData.get("client_id"),
      "Canvas client_id is required.",
    ),
    deploymentId: resolveLoginDeploymentId({
      primary: formValueAsString(formData.get("deployment_id")),
      secondary: formValueAsString(formData.get("lti_deployment_id")),
    }),
    ltiMessageHint: normalizeOptionalString(formData.get("lti_message_hint")),
  };
}

function combineNotices(
  primary: AdminNotice | null,
  secondary: AdminNotice,
): AdminNotice {
  if (primary === null) {
    return secondary;
  }

  return {
    tone: secondary.tone,
    title: secondary.title,
    detail: secondary.detail,
    items: [
      ...(secondary.items ?? []),
      primary.detail,
      ...(primary.items ?? []),
    ],
  };
}

function resolveLoginDeploymentId(input: {
  primary: string | null;
  secondary: string | null;
}): string {
  const primary = normalizeNullableString(input.primary);
  const secondary = normalizeNullableString(input.secondary);

  if (primary !== null && secondary !== null && primary !== secondary) {
    throw new Error(
      "Canvas deployment_id and lti_deployment_id did not match.",
    );
  }

  return requireTrimmedString(
    primary ?? secondary,
    "Canvas deployment_id is required.",
  );
}

function requireTrimmedString(
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

function normalizeNullableString(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function formValueAsString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

async function loadPreviewCapabilityLog(input: {
  repository: PackageReviewRepository;
  packageVersionId: number;
}): Promise<{
  session: PreviewSessionRecord | null;
  evidence: PreviewEvidenceRecord[];
}> {
  const session = await input.repository.getLatestPreviewSessionByPackageVersion(
    input.packageVersionId,
  );

  if (session === null) {
    return {
      session: null,
      evidence: [],
    };
  }

  return {
    session,
    evidence: await input.repository.listPreviewEvidence(session.sessionId),
  };
}

function runtimeFilePathFromRequest(context: Context): string {
  const pathname = new URL(context.req.url).pathname;
  const prefix = `/runtime/sessions/${context.req.param("sessionId")}/files/`;

  if (!pathname.startsWith(prefix)) {
    throw new Error("Runtime file path is invalid.");
  }

  return decodeURIComponent(pathname.slice(prefix.length));
}

async function recordRejectedLaunchAudit(input: {
  repository: PackageReviewRepository;
  state: string | null;
  error: unknown;
}): Promise<void> {
  const loginState = input.state === null
    ? null
    : await input.repository.getLoginStateByState(input.state).catch(() =>
      null
    );
  const deployment = loginState === null
    ? null
    : await input.repository.getDeploymentByBinding({
      issuer: loginState.issuer,
      clientId: loginState.clientId,
      deploymentId: loginState.deploymentId,
    }).catch(() => null);

  await input.repository.recordAuditEvent({
    eventType: "launch.rejected",
    actorType: "platform",
    actorId: null,
    deploymentRecordId: deployment?.id ?? null,
    packageVersionId: deployment?.enabledPackageVersionId ?? null,
    attemptId: null,
    lineItemBindingId: null,
    status: "failed",
    summary: "Rejected the Canvas launch before runtime handoff.",
    detail: {
      code: normalizeLaunchRejectedCode(input.error),
      message: errorMessage(input.error),
      issuer: loginState?.issuer ?? null,
      clientId: loginState?.clientId ?? null,
      deploymentId: loginState?.deploymentId ?? null,
      targetLinkUri: loginState?.targetLinkUri ?? null,
      internalDeploymentSlug: deployment?.slug ?? null,
      appId: deployment?.appId ?? null,
    },
    occurredAt: new Date().toISOString(),
  });
}

function normalizeLaunchRejectedCode(error: unknown): string {
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

function normalizeRetryFailureCode(error: unknown): string {
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

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Lantern hit an unexpected error.";
}

function packageDetailPath(appId: string, version: string): string {
  return `/admin/packages/${appId}/versions/${version}`;
}
