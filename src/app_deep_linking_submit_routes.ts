import type { Context, Hono } from "@hono/hono";
import {
  renderDeepLinkingPickerResponse,
  renderDeepLinkingSubmitStatusPage,
} from "./app_deep_linking_views.ts";
import { normalizeOptionalString } from "./app_request_support.ts";
import { deepLinkingReturnErrorMessage } from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";
import { buildDeepLinkingResponseSubmission } from "./lti/deep_linking_response.ts";
import {
  authorizeDeepLinkingSession,
  createReviewedPlacementFromDeepLinkingSession,
  listDeepLinkingResources,
  resolveDeepLinkingSelection,
} from "./lti/deep_linking.ts";
import type { DeepLinkingSessionRecord, LtiPlacement } from "./lti/types.ts";
import { resolveConfiguredPublicOrigin } from "./public_origin.ts";

const sessionVerificationFailureDetail =
  "Lantern could not verify this Deep Linking session. Reopen Deep Linking authoring from the LMS and try again.";

export function registerDeepLinkingSubmitRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.post("/lti/deep-linking/sessions/:sessionId/submit", async (context) => {
    const repository = services.getRepository();
    const formData = await context.req.formData();
    const sessionId = context.req.param("sessionId");
    const token = normalizeOptionalString(formData.get("token"));
    const session = await repository.getDeepLinkingSessionById(sessionId);

    if (session === null) {
      return renderSessionVerificationFailure(context, 404);
    }

    if (token === null) {
      return renderSessionVerificationFailure(context, 409);
    }

    try {
      authorizeDeepLinkingSession({
        token,
        expected: session,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("has already been used")
      ) {
        return context.html(
          renderDeepLinkingSubmitStatusPage({
            tone: "error",
            title: buildDeepLinkingReturnTitle(
              session.placement,
              "alreadyUsed",
            ),
            detail: buildDeepLinkingReplayFailureDetail(session.placement),
            session,
            selection: resolveDeepLinkingSelection({
              session,
              resources: await listDeepLinkingResources({
                repository,
                session,
              }),
            }),
          }),
          409,
        );
      }

      return renderSessionVerificationFailure(context, 409);
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
            detail: buildDeepLinkingMissingSelectionDetail(session.placement),
          },
          status: 409,
        });
      }

      const deployment = await repository.getDeploymentBySlug(
        session.deploymentSlug,
      );

      if (deployment === null || deployment.id !== session.deploymentRecordId) {
        throw new Error(
          `Deployment ${session.deploymentSlug} could not be loaded for this Deep Linking session.`,
        );
      }

      const packageVersion = await repository.getPackageVersionById(
        selection.packageVersionId,
      );

      if (packageVersion === null) {
        throw new Error(
          `Reviewed package version ${selection.packageVersionId} could not be loaded for the LMS return.`,
        );
      }

      try {
        await repository.consumeDeepLinkingSession({
          sessionId: session.sessionId,
          usedAt: new Date().toISOString(),
        });
      } catch {
        return context.html(
          renderDeepLinkingSubmitStatusPage({
            tone: "error",
            title: buildDeepLinkingReturnTitle(
              session.placement,
              "alreadyUsed",
            ),
            detail: buildDeepLinkingReplayFailureDetail(session.placement),
            session,
            selection,
          }),
          409,
        );
      }

      const { placement } = await createReviewedPlacementFromDeepLinkingSession(
        {
          repository,
          session,
        },
      );
      await repository.recordAuditEvent({
        eventType: "deep_linking.placement.created",
        actorType: "platform",
        actorId: session.userId,
        deploymentRecordId: session.deploymentRecordId,
        packageVersionId: placement.packageVersionId,
        attemptId: null,
        lineItemBindingId: null,
        status: "succeeded",
        summary: "Created a reviewed placement for Deep Linking return.",
        detail: {
          deepLinkingSessionId: session.sessionId,
          placementId: placement.placementId,
          contentPath: placement.contentPath,
          activityId: placement.activityId,
          contextId: placement.contextId,
        },
        occurredAt: new Date().toISOString(),
      });
      const submission = await buildDeepLinkingResponseSubmission({
        session,
        deployment,
        placement,
        packageVersion,
        appOrigin: resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header("forwarded") ?? null,
          xForwardedHost: context.req.header("x-forwarded-host") ?? null,
          xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
          configuredOrigin: Deno.env.get("APP_ORIGIN"),
        }),
      });

      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "success",
          title: buildDeepLinkingReturnTitle(session.placement, "returning"),
          detail: buildDeepLinkingSuccessDetail(session.placement),
          session,
          selection,
          submission,
        }),
      );
    } catch (error) {
      return context.html(
        renderDeepLinkingSubmitStatusPage({
          tone: "error",
          title: buildDeepLinkingReturnTitle(session.placement, "failed"),
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
}

function renderSessionVerificationFailure(context: Context, status: 404 | 409) {
  return context.html(
    renderDeepLinkingSubmitStatusPage({
      tone: "error",
      title: "Session verification failed",
      detail: sessionVerificationFailureDetail,
    }),
    status,
  );
}

function buildDeepLinkingReturnTitle(
  placement: LtiPlacement,
  state: "alreadyUsed" | "failed" | "returning",
): string {
  const resourceLabel = describeDeepLinkingPlacement(placement).capitalized;

  switch (state) {
    case "alreadyUsed":
      return `${resourceLabel} return already used`;
    case "failed":
      return `${resourceLabel} return failed`;
    case "returning":
      return `Returning ${
        describeDeepLinkingPlacement(placement).resource
      } to LMS`;
  }
}

function buildDeepLinkingReplayFailureDetail(placement: LtiPlacement): string {
  return "This Deep Linking return has already been used. Reopen Deep Linking authoring from the LMS, confirm the reviewed " +
    describeDeepLinkingPlacement(placement).resource + ", and return once.";
}

function buildDeepLinkingMissingSelectionDetail(
  placement: LtiPlacement,
): string {
  return "Save one reviewed " +
    describeDeepLinkingPlacement(placement).resource +
    " before returning it to the LMS.";
}

function buildDeepLinkingSuccessDetail(placement: LtiPlacement): string {
  return "Lantern created the reviewed placement and is posting this reviewed " +
    describeDeepLinkingPlacement(placement).resource + " back to the LMS.";
}

function describeDeepLinkingPlacement(
  placement: Pick<DeepLinkingSessionRecord, "placement">["placement"],
): {
  resource: string;
  capitalized: string;
} {
  if (placement === "resource_selection") {
    return {
      resource: "course resource",
      capitalized: "Course resource",
    };
  }

  return {
    resource: "assignment resource",
    capitalized: "Assignment resource",
  };
}
