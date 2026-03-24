import { csrf } from "@hono/hono/csrf";
import { type Context, Hono } from "@hono/hono";
import { createDatabasePool } from "./db/pool.ts";
import {
  buildDefaultDeploymentSeed,
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
import type { PackageVersionRecord } from "./package_review/types.ts";
import { renderHomePage } from "./pages/home.ts";

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
        { error: error instanceof Error ? error.message : "Config unavailable." },
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
      const history = await repository.listPackageVersionsByApp(
        context.req.param("appId"),
      );

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: "error",
              title: "Deployment page unavailable",
              detail:
                "Import a package version first so Lantern has an exact app to pin.",
            },
          }),
          404,
        );
      }

      const appTitle = history[0]?.title ?? history[0]?.appId ?? "Package";
      const seed = buildDefaultDeploymentSeed(
        context.req.param("appId"),
        appTitle,
      );
      const deployment = await repository.getDeploymentBySlug(seed.slug);
      const canvasConfigUrl = getCanvasConfigUrlNoticeSafe();

      return context.html(
        renderDeploymentDetailPage({
          appId: context.req.param("appId"),
          appTitle,
          history,
          deployment,
          canvasConfigUrl: canvasConfigUrl.url,
          supportedCanvasEnvironments: listCanvasEnvironments(),
          notice: canvasConfigUrl.notice,
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

      await repository.pinDeploymentVersion({
        slug: seed.slug,
        label: seed.label,
        appId,
        packageVersionId: selectedId,
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

      await repository.saveDeploymentBinding({
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

function createErrorNotice(title: string, error: unknown): AdminNotice {
  const message = error instanceof Error
    ? error.message
    : "Lantern hit an unexpected error.";
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
    error.message.includes("Choose one supported Canvas environment")
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

function packageDetailPath(appId: string, version: string): string {
  return `/admin/packages/${appId}/versions/${version}`;
}
