import { csrf } from "@hono/hono/csrf";
import { type Context, Hono } from "@hono/hono";
import { createDatabasePool } from "./db/pool.ts";
import {
  buildDefaultDeploymentSeed,
  type DeploymentNrpsVerificationSummary,
  renderDeploymentDetailPage,
} from "./admin/deployment_detail.ts";
import type { AdminNotice } from "./admin/layout.ts";
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
import { LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE } from "./lti/types.ts";
import { type CanvasLoginRequest, createLoginRedirect } from "./lti/login.ts";
import { createRuntimeSession, validateLaunchRequest } from "./lti/launch.ts";
import { getPublicJwkSet } from "./lti/tool_key.ts";
import { renderPackageDetailPage } from "./admin/package_detail.ts";
import { renderPackageIndexPage } from "./admin/package_index.ts";
import {
  importDemoPackage,
  type ImportedPackageVersion,
} from "./package_review/intake.ts";
import {
  createPackageReviewRepository,
  type PackageReviewRepository,
} from "./package_review/repository.ts";
import type {
  DeploymentRecord,
  PackageVersionRecord,
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
  acceptAttemptEvent,
  finalizeRuntimeAttempt,
} from "./runtime/gateway.ts";

export interface AppServices {
  getRepository: () => PackageReviewRepository;
  importDemoPackage: (
    options?: { storageRoot?: string },
  ) => Promise<ImportedPackageVersion>;
}

let defaultRepository: PackageReviewRepository | null = null;

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
    try {
      const repository = resolvedServices.getRepository();
      const formData = await context.req.formData();
      const launch = await validateLaunchRequest({
        repository,
        state: requireTrimmedFormValue(
          formData.get("state"),
          "Launch state is required.",
        ),
        idToken: requireTrimmedFormValue(
          formData.get("id_token"),
          "Launch id_token is required.",
        ),
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
      return context.text(errorMessage(error), statusForError(error));
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

      return context.json(await loadRuntimeActivityContent(session));
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
      const versions = await resolvedServices.getRepository()
        .listPackageVersions();
      return context.html(renderPackageIndexPage({ versions }));
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

      return context.html(
        renderDeploymentDetailPage({
          appId: context.req.param("appId"),
          appTitle: detail.appTitle,
          history: detail.history,
          deployment: detail.deployment,
          nrpsVerification: detail.nrpsVerification,
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
  return {
    getRepository: services.getRepository ?? getDefaultRepository,
    importDemoPackage: services.importDemoPackage ?? importDemoPackage,
  };
}

function getDefaultRepository(): PackageReviewRepository {
  if (defaultRepository === null) {
    defaultRepository = createPackageReviewRepository(createDatabasePool());
  }

  return defaultRepository;
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
    error.message.includes("Launch ")
  ) {
    return 409;
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

function runtimeFilePathFromRequest(context: Context): string {
  const pathname = new URL(context.req.url).pathname;
  const prefix = `/runtime/sessions/${context.req.param("sessionId")}/files/`;

  if (!pathname.startsWith(prefix)) {
    throw new Error("Runtime file path is invalid.");
  }

  return decodeURIComponent(pathname.slice(prefix.length));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Lantern hit an unexpected error.";
}

function packageDetailPath(appId: string, version: string): string {
  return `/admin/packages/${appId}/versions/${version}`;
}
