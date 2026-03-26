import type { Hono } from "@hono/hono";
import {
  renderPlacementAuditPage,
  renderPlacementAuditRequestPage,
} from "./admin/placement_audit_page.ts";
import { loadPlacementAuditTimeline } from "./app_deployment_support.ts";
import { createErrorNotice } from "./app_notice_support.ts";
import {
  normalizeOptionalString,
  requireTrimmedString,
} from "./app_request_support.ts";
import { statusForPlacementAuditError } from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";

export function registerAdminPlacementRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.get("/admin/placements", (context) => {
    const url = new URL(context.req.url);
    const placementId = normalizeOptionalString(
      url.searchParams.get("placementId"),
    );

    if (placementId !== null) {
      return context.redirect(
        `/admin/placements/${encodeURIComponent(placementId)}`,
        303,
      );
    }

    return context.html(
      renderPlacementAuditRequestPage({
        notice: null,
      }),
    );
  });

  app.get("/admin/placements/:placementId", async (context) => {
    const repository = services.getRepository();
    const placementId = context.req.param("placementId");

    try {
      const snapshot = await repository.requirePlacementAuditSnapshotById(
        requireTrimmedString(placementId, "Placement id is required."),
      );
      const timeline = await loadPlacementAuditTimeline(
        repository,
        snapshot.placement,
      );

      return context.html(
        renderPlacementAuditPage({
          snapshot,
          timeline,
        }),
      );
    } catch (error) {
      return context.html(
        renderPlacementAuditRequestPage({
          notice: createErrorNotice("Placement audit unavailable", error),
        }),
        statusForPlacementAuditError(error),
      );
    }
  });
}
