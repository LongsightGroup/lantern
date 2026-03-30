import type { Hono } from "@hono/hono";
import { getManagedDeploymentSlot } from "./admin/deployment_detail.ts";
import { renderDynamicRegistrationStatusPage } from "./app_dynamic_registration_views.ts";
import { loadDeploymentDetailState } from "./app_deployment_support.ts";
import {
  buildBindingAuditDetail,
  normalizeOptionalQueryValue,
  requireTrimmedQueryValue,
} from "./app_admin_deployment_detail_route_support.ts";
import { recordInteropPathUsed } from "./interop_audit.ts";
import { completeCanvasDynamicRegistration } from "./lti/canvas_dynamic_registration.ts";
import { consumeDynamicRegistrationState } from "./lti/dynamic_registration_state.ts";
import { completeMoodleDynamicRegistration } from "./lti/moodle_dynamic_registration.ts";
import { completeSakaiDynamicRegistration } from "./lti/sakai_dynamic_registration.ts";
import { errorMessage, statusForError } from "./app_status_support.ts";
import { resolveConfiguredPublicOrigin } from "./public_origin.ts";
import type { AppServices } from "./app_services.ts";

export function registerAdminDeploymentDynamicRegistrationRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.get(
    "/admin/packages/:appId/deployment/register/canvas",
    async (context) => {
      const appId = context.req.param("appId");

      try {
        const repository = services.getRepository();
        const appOrigin = resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header("forwarded") ?? null,
          xForwardedHost: context.req.header("x-forwarded-host") ?? null,
          xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
          configuredOrigin: Deno.env.get("APP_ORIGIN"),
        });
        const detail = await loadDeploymentDetailState(
          repository,
          appId,
          appOrigin,
        );
        const searchParams = new URL(context.req.url).searchParams;
        const openidConfigurationUrl = requireTrimmedQueryValue(
          searchParams.get("openid_configuration"),
          "Canvas openid_configuration is required.",
        );
        const registrationToken = requireTrimmedQueryValue(
          searchParams.get("registration_token"),
          "Canvas registration_token is required.",
        );
        await consumeDynamicRegistrationState({
          repository,
          state: requireTrimmedQueryValue(
            searchParams.get("state"),
            "Dynamic registration state is required. Start again from Lantern app settings.",
          ),
          appId,
          lms: "canvas",
        });
        const slot = getManagedDeploymentSlot(detail.slots, "canvas");
        const registration = await completeCanvasDynamicRegistration({
          appTitle: detail.appTitle,
          openidConfigurationUrl,
          registrationToken,
          appOrigin,
        });
        const deployment = await repository.saveCanvasRegistration({
          slug: slot.deployment.slug,
          label: slot.deployment.label,
          appId,
          canvasEnvironment: registration.canvasEnvironment,
          issuer: registration.issuer,
          clientId: registration.clientId,
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
          summary:
            "Saved the Canvas setup and queued the exact deployment binding for the first launch.",
          detail: {
            lms: "canvas",
            deploymentSlug: deployment.slug,
            registrationMode: "dynamic",
            canvasEnvironment: registration.canvasEnvironment,
            issuer: registration.issuer,
            clientId: registration.clientId,
            deploymentId: null,
          },
          occurredAt: new Date().toISOString(),
        });

        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "success",
            title: "Canvas setup saved",
            detail:
              "Lantern saved the Canvas environment and Client ID. Finish the tool enablement in Canvas, then launch it once so Lantern can capture the exact deployment ID automatically.",
            closeLabel: "Close and return to Canvas",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=canvas&registered=canvas#slot-panel`,
            returnLabel: "Open Lantern deployment detail",
          }),
        );
      } catch (error) {
        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "error",
            title: "Canvas setup blocked",
            detail: errorMessage(error),
            closeLabel: "Close and return to Canvas",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=canvas#slot-panel`,
            returnLabel: "Open Lantern deployment detail",
          }),
          statusForError(error),
        );
      }
    },
  );

  app.get(
    "/admin/packages/:appId/deployment/register/moodle",
    async (context) => {
      const appId = context.req.param("appId");

      try {
        const repository = services.getRepository();
        const appOrigin = resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header("forwarded") ?? null,
          xForwardedHost: context.req.header("x-forwarded-host") ?? null,
          xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
          configuredOrigin: Deno.env.get("APP_ORIGIN"),
        });
        const detail = await loadDeploymentDetailState(
          repository,
          appId,
          appOrigin,
        );
        const searchParams = new URL(context.req.url).searchParams;
        const openidConfigurationUrl = requireTrimmedQueryValue(
          searchParams.get("openid_configuration"),
          "Moodle openid_configuration is required.",
        );
        const registrationToken = normalizeOptionalQueryValue(
          searchParams.get("registration_token"),
        );
        await consumeDynamicRegistrationState({
          repository,
          state: requireTrimmedQueryValue(
            searchParams.get("state"),
            "Dynamic registration state is required. Start again from Lantern app settings.",
          ),
          appId,
          lms: "moodle",
        });
        const slot = getManagedDeploymentSlot(detail.slots, "moodle");
        const registration = await completeMoodleDynamicRegistration({
          appTitle: detail.appTitle,
          openidConfigurationUrl,
          registrationToken,
          appOrigin,
        });
        const deployment = await repository.saveDeploymentBinding({
          slug: slot.deployment.slug,
          label: slot.deployment.label,
          appId,
          binding: registration.binding,
        });

        if (registration.interoperability.usedDeploymentIdFallback) {
          await recordInteropPathUsed({
            repository,
            scope: "deployment",
            path: "dynamic_registration_deployment_id_fallback",
            actorType: "platform",
            deploymentRecordId: deployment.id,
            packageVersionId: deployment.enabledPackageVersionId,
            summary:
              "Lantern used a Moodle dynamic registration compatibility path.",
            detail: {
              lms: "moodle",
              deploymentSlug: deployment.slug,
              deploymentIdSource:
                registration.interoperability.deploymentIdSource,
            },
          });
        }

        await repository.recordAuditEvent({
          eventType: "deployment.binding_saved",
          actorType: "user",
          actorId: null,
          deploymentRecordId: deployment.id,
          packageVersionId: deployment.enabledPackageVersionId,
          attemptId: null,
          lineItemBindingId: null,
          status: "succeeded",
          summary: "Saved the Moodle connection through the setup link.",
          detail: {
            deploymentSlug: deployment.slug,
            registrationMode: "dynamic",
            ...buildBindingAuditDetail(registration.binding),
          },
          occurredAt: new Date().toISOString(),
        });

        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "success",
            title: "Moodle connection saved",
            detail:
              "Lantern finished Moodle setup and saved the exact Moodle connection.",
            closeLabel: "Close and return to Moodle",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=moodle#slot-panel`,
            returnLabel: "Open Lantern deployment detail",
          }),
        );
      } catch (error) {
        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "error",
            title: "Moodle setup blocked",
            detail: errorMessage(error),
            closeLabel: "Close and return to Moodle",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=moodle#slot-panel`,
            returnLabel: "Open Lantern deployment detail",
          }),
          statusForError(error),
        );
      }
    },
  );

  app.get(
    "/admin/packages/:appId/deployment/register/sakai",
    async (context) => {
      const appId = context.req.param("appId");
      const searchParams = new URL(context.req.url).searchParams;
      const openidConfigurationUrl = normalizeOptionalQueryValue(
        searchParams.get("openid_configuration"),
      );
      const registrationToken = normalizeOptionalQueryValue(
        searchParams.get("registration_token"),
      );

      if (openidConfigurationUrl === null || registrationToken === null) {
        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "error",
            title: "Open this from Sakai",
            detail:
              "This is Lantern's Sakai Dynamic Registration URL. Paste it into Sakai's LTI Dynamic Registration flow instead of opening it directly in a browser.",
            closeLabel: "Close",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=sakai#slot-panel`,
            returnLabel: "Open Lantern app settings",
          }),
          400,
        );
      }

      try {
        const repository = services.getRepository();
        const appOrigin = resolveConfiguredPublicOrigin({
          requestUrl: context.req.url,
          forwardedHeader: context.req.header("forwarded") ?? null,
          xForwardedHost: context.req.header("x-forwarded-host") ?? null,
          xForwardedProto: context.req.header("x-forwarded-proto") ?? null,
          configuredOrigin: Deno.env.get("APP_ORIGIN"),
        });
        const detail = await loadDeploymentDetailState(
          repository,
          appId,
          appOrigin,
        );
        await consumeDynamicRegistrationState({
          repository,
          state: requireTrimmedQueryValue(
            searchParams.get("state"),
            "Dynamic registration state is required. Start again from Lantern app settings.",
          ),
          appId,
          lms: "sakai",
        });
        const slot = getManagedDeploymentSlot(detail.slots, "sakai");
        const binding = await completeSakaiDynamicRegistration({
          appId,
          appTitle: detail.appTitle,
          openidConfigurationUrl,
          registrationToken,
          appOrigin,
        });
        const deployment = await repository.saveDeploymentBinding({
          slug: slot.deployment.slug,
          label: slot.deployment.label,
          appId,
          binding,
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
          summary: "Saved the Sakai connection through the setup link.",
          detail: {
            deploymentSlug: deployment.slug,
            registrationMode: "dynamic",
            ...buildBindingAuditDetail(binding),
          },
          occurredAt: new Date().toISOString(),
        });

        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "success",
            title: "Sakai connection saved",
            detail:
              "Lantern finished Sakai setup and saved the exact Sakai connection. Continue in Sakai to review and save the tool.",
            closeLabel: "Continue in Sakai",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=sakai&registered=sakai#slot-panel`,
            returnLabel: "Open Lantern app settings",
          }),
        );
      } catch (error) {
        return context.html(
          renderDynamicRegistrationStatusPage({
            tone: "error",
            title: "Sakai setup blocked",
            detail: errorMessage(error),
            closeLabel: "Close and return to Sakai",
            returnUrl:
              `/admin/packages/${appId}/deployment?lms=sakai#slot-panel`,
            returnLabel: "Open Lantern app settings",
          }),
          statusForError(error),
        );
      }
    },
  );
}
