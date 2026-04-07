import type { Hono } from "@hono/hono";
import {
  handleReviewDecision,
  renderInventoryError,
  renderPackagesPage,
} from "./app_admin_support.ts";
import { createErrorNotice, packageDetailPath } from "./app_notice_support.ts";
import { requireTrimmedFormValue } from "./app_request_support.ts";
import { statusForError } from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";
import { renderPackageDetailPage } from "./admin/package_detail.ts";
import { renderPackageIndexPage } from "./admin/package_index.ts";
import { isReferencePackageId } from "./package_review/intake.ts";

export function registerAdminInventoryRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.get("/admin/packages", async (context) => {
    try {
      return await renderPackagesPage(context, services);
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

  app.post("/admin/packages/import-reference", async (context) => {
    try {
      const repository = services.getRepository();
      const formData = await context.req.formData();
      const appId = requireSupportedReferencePackageId(formData.get("appId"));
      const referencePackage = await services.readReferencePackageReviewData(
        appId,
      );
      const existing = await repository.getPackageVersionByAppVersion(
        referencePackage.appId,
        referencePackage.version,
      );

      if (existing) {
        return context.redirect(
          packageDetailPath(existing.appId, existing.version),
          303,
        );
      }

      const storedReferencePackage = await services
        .loadReferencePackageSnapshot(appId);

      if (storedReferencePackage) {
        const packageVersion = await repository.registerPackageVersion(
          storedReferencePackage,
        );

        return context.redirect(
          packageDetailPath(packageVersion.appId, packageVersion.version),
          303,
        );
      }

      const imported = await services.importReferencePackage(appId);
      const packageVersion = await repository.registerPackageVersion(imported);

      return context.redirect(
        packageDetailPath(packageVersion.appId, packageVersion.version),
        303,
      );
    } catch (error) {
      return await renderInventoryError(
        context,
        services,
        "Reference app import blocked",
        error,
      );
    }
  });

  app.get("/admin/packages/:appId/versions/:version", async (context) => {
    try {
      const repository = services.getRepository();
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
              title: "Version not found",
              detail: "Lantern could not find that app version.",
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
          notice: createErrorNotice("Version details unavailable", error),
        }),
        statusForError(error),
      );
    }
  });

  app.post("/admin/packages/:id/approve", async (context) => {
    return await handleReviewDecision(context, services, "approve");
  });

  app.post("/admin/packages/:id/reject", async (context) => {
    return await handleReviewDecision(context, services, "reject");
  });
}

function requireSupportedReferencePackageId(
  value: FormDataEntryValue | null,
): string {
  const appId = requireTrimmedFormValue(
    value,
    "Choose one of Lantern's shipped reference apps.",
  );

  if (!isReferencePackageId(appId)) {
    throw new Error("Choose one of Lantern's shipped reference apps.");
  }

  return appId;
}
