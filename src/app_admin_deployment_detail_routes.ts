import type { Hono } from "@hono/hono";
import {
  type DeploymentEditorField,
  type DeploymentEditorState,
  getManagedDeploymentSlot,
  renderDeploymentDetailPage,
} from "./admin/deployment_detail.ts";
import { renderPackageIndexPage } from "./admin/package_index.ts";
import { loadDeploymentDetailState } from "./app_deployment_support.ts";
import { createErrorNotice } from "./app_notice_support.ts";
import {
  buildCanvasConfigUrl,
  listCanvasEnvironments,
  parseCanvasEnvironment,
  resolveCanvasIssuer,
} from "./lti/config.ts";
import type { DeploymentBinding, LmsType } from "./lti/types.ts";
import { requireTrimmedFormValue } from "./app_request_support.ts";
import { errorMessage, statusForError } from "./app_status_support.ts";
import type { AppServices } from "./app_services.ts";

export function registerAdminDeploymentDetailRoutes(
  app: Hono,
  services: AppServices,
): void {
  app.get("/admin/packages/:appId/deployment", async (context) => {
    try {
      const selectedLms = parseOptionalManagedDeploymentLms(
        new URL(context.req.url).searchParams.get("lms"),
      );
      const repository = services.getRepository();
      const detail = await loadDeploymentDetailState(
        repository,
        context.req.param("appId"),
      );
      const controlPlaneDetail = detail.primaryDeployment === null
        ? null
        : await services
          .getOpsRepository()
          .getControlPlaneDeploymentDetail(detail.primaryDeployment.id);

      return context.html(
        renderDeploymentDetailPage({
          appId: context.req.param("appId"),
          appTitle: detail.appTitle,
          history: detail.history,
          deployments: detail.deployments,
          selectedLms,
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

  app.post("/admin/packages/:appId/deployment/pin", async (context) => {
    const appId = context.req.param("appId");
    let lms: LmsType | null = null;
    let formData: FormData | null = null;

    try {
      const repository = services.getRepository();
      formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: "error",
              title: `${formatLmsLabel(lms)} version picker unavailable`,
              detail: `Import the app package before you attempt to save the ${
                formatLmsLabel(lms)
              } deployment pin.`,
            },
          }),
          404,
        );
      }

      const detail = await loadDeploymentDetailState(repository, appId);
      const slot = getManagedDeploymentSlot(detail.slots, lms);

      if (slot.deployment.binding?.lms !== lms) {
        throw new Error(
          `Save the ${formatLmsLabel(lms)} binding before you pin a version.`,
        );
      }

      const selectedId = parseRequiredPackageVersionId(formData);

      const deployment = await repository.pinDeploymentVersion({
        slug: slot.deployment.slug,
        label: slot.deployment.label,
        appId,
        lmsType: lms,
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
        summary: `Pinned an exact reviewed package version for the ${
          formatLmsLabel(lms)
        } deployment.`,
        detail: {
          lms,
          deploymentSlug: deployment.slug,
          packageVersionId: deployment.enabledPackageVersionId,
          packageVersion: deployment.enabledPackageVersion,
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/admin/packages/${appId}/deployment?lms=${lms}#slot-panel`,
        303,
      );
    } catch (error) {
      return await import("./app_admin_support.ts").then((
        { renderDeploymentError },
      ) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null
            ? "Version pin blocked"
            : `${formatLmsLabel(lms)} version pin blocked`,
          error,
          {
            selectedLms: lms,
            editorState: buildPinEditorState(
              lms,
              formData,
              lms === null
                ? "Version pin blocked"
                : `${formatLmsLabel(lms)} version pin blocked`,
              error,
            ),
          },
        )
      );
    }
  });

  app.post("/admin/packages/:appId/deployment/install", async (context) => {
    const appId = context.req.param("appId");
    let lms: LmsType | null = null;
    let formData: FormData | null = null;

    try {
      const repository = services.getRepository();
      formData = await context.req.formData();
      lms = parseManagedDeploymentLms(formData);
      const history = await repository.listPackageVersionsByApp(appId);

      if (history.length === 0) {
        return context.html(
          renderPackageIndexPage({
            versions: [],
            notice: {
              tone: "error",
              title: `${formatLmsLabel(lms)} install unavailable`,
              detail: `Import the app package before you attempt to save the ${
                formatLmsLabel(lms)
              } binding.`,
            },
          }),
          404,
        );
      }

      const detail = await loadDeploymentDetailState(repository, appId);
      const slot = getManagedDeploymentSlot(detail.slots, lms);
      const binding = buildDeploymentBindingFromFormData(lms, formData);

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
        summary: `Saved the ${formatLmsLabel(lms)} deployment binding.`,
        detail: {
          deploymentSlug: deployment.slug,
          ...buildBindingAuditDetail(binding),
        },
        occurredAt: new Date().toISOString(),
      });

      return context.redirect(
        `/admin/packages/${appId}/deployment?lms=${lms}#slot-panel`,
        303,
      );
    } catch (error) {
      return await import("./app_admin_support.ts").then((
        { renderDeploymentError },
      ) =>
        renderDeploymentError(
          context,
          services,
          appId,
          lms === null
            ? "Deployment install blocked"
            : `${formatLmsLabel(lms)} install blocked`,
          error,
          {
            selectedLms: lms,
            editorState: buildInstallEditorState(
              lms,
              formData,
              lms === null
                ? "Deployment install blocked"
                : `${formatLmsLabel(lms)} install blocked`,
              error,
            ),
          },
        )
      );
    }
  });
}

function buildInstallEditorState(
  lms: LmsType | null,
  formData: FormData | null,
  title: string,
  error: unknown,
): DeploymentEditorState | null {
  if (lms === null) {
    return null;
  }

  return {
    lms,
    focusSection: "install",
    notice: createErrorNotice(title, error),
    fieldErrors: buildFieldErrors(lms, errorMessage(error)),
    installValues: collectInstallValues(lms, formData),
    pinPackageVersionId: null,
  };
}

function buildPinEditorState(
  lms: LmsType | null,
  formData: FormData | null,
  title: string,
  error: unknown,
): DeploymentEditorState | null {
  if (lms === null) {
    return null;
  }

  return {
    lms,
    focusSection: "pin",
    notice: createErrorNotice(title, error),
    fieldErrors: buildFieldErrors(lms, errorMessage(error)),
    installValues: collectInstallValues(lms, formData),
    pinPackageVersionId: formValueString(formData, "packageVersionId"),
  };
}

function collectInstallValues(
  lms: LmsType,
  formData: FormData | null,
): Partial<Record<DeploymentEditorField, string>> {
  switch (lms) {
    case "canvas":
      return collectFieldValues(formData, [
        "canvasEnvironment",
        "clientId",
        "deploymentId",
      ]);
    case "moodle":
      return collectFieldValues(formData, [
        "issuer",
        "clientId",
        "deploymentId",
        "authenticationRequestUrl",
        "accessTokenUrl",
        "jwksUrl",
      ]);
    case "sakai":
      return collectFieldValues(formData, [
        "issuer",
        "clientId",
        "deploymentId",
        "oidcAuthenticationUrl",
        "accessTokenUrl",
        "jwksUrl",
      ]);
  }
}

function collectFieldValues(
  formData: FormData | null,
  fields: DeploymentEditorField[],
): Partial<Record<DeploymentEditorField, string>> {
  const values: Partial<Record<DeploymentEditorField, string>> = {};

  for (const field of fields) {
    const value = formValueString(formData, field);

    if (value !== null) {
      values[field] = value;
    }
  }

  return values;
}

function buildFieldErrors(
  lms: LmsType,
  message: string,
): Partial<Record<DeploymentEditorField, string>> {
  const field = resolveFieldError(lms, message);

  return field === null ? {} : { [field]: message };
}

function resolveFieldError(
  lms: LmsType,
  message: string,
): DeploymentEditorField | null {
  switch (lms) {
    case "canvas":
      switch (message) {
        case "Canvas Client ID is required.":
          return "clientId";
        case "Canvas Deployment ID is required.":
          return "deploymentId";
        case "Choose an approved version.":
          return "packageVersionId";
        default:
          return null;
      }
    case "moodle":
      switch (message) {
        case "Moodle Platform ID is required.":
          return "issuer";
        case "Moodle Client ID is required.":
          return "clientId";
        case "Moodle Deployment ID is required.":
          return "deploymentId";
        case "Moodle Authentication request URL is required.":
          return "authenticationRequestUrl";
        case "Moodle Access token URL is required.":
          return "accessTokenUrl";
        case "Moodle Public keyset URL is required.":
          return "jwksUrl";
        case "Choose an approved version.":
          return "packageVersionId";
        default:
          return null;
      }
    case "sakai":
      switch (message) {
        case "Sakai Platform ID is required.":
          return "issuer";
        case "Sakai Client ID is required.":
          return "clientId";
        case "Sakai Deployment ID is required.":
          return "deploymentId";
        case "Sakai OIDC authentication URL is required.":
          return "oidcAuthenticationUrl";
        case "Sakai Access token URL is required.":
          return "accessTokenUrl";
        case "Sakai Public keyset URL is required.":
          return "jwksUrl";
        case "Choose an approved version.":
          return "packageVersionId";
        default:
          return null;
      }
  }
}

function parseRequiredPackageVersionId(formData: FormData): number {
  const rawValue = requireTrimmedFormValue(
    formData.get("packageVersionId"),
    "Choose an approved version.",
  );
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Choose an approved version.");
  }

  return value;
}

function formValueString(
  formData: FormData | null,
  field: string,
): string | null {
  const value = formData?.get(field);
  return typeof value === "string" ? value : null;
}

function parseOptionalManagedDeploymentLms(
  value: string | null,
): LmsType | null {
  switch (value) {
    case "canvas":
    case "moodle":
    case "sakai":
      return value;
    default:
      return null;
  }
}

function parseManagedDeploymentLms(formData: FormData): LmsType {
  const value = requireTrimmedFormValue(
    formData.get("lms"),
    "LMS is required.",
  );

  switch (value) {
    case "canvas":
    case "moodle":
    case "sakai":
      return value;
    default:
      throw new Error("Choose one supported LMS deployment.");
  }
}

function buildDeploymentBindingFromFormData(
  lms: LmsType,
  formData: FormData,
): DeploymentBinding {
  switch (lms) {
    case "canvas": {
      buildCanvasConfigUrl();
      const canvasEnvironment = parseCanvasEnvironment(
        formData.get("canvasEnvironment"),
      );

      return {
        lms: "canvas",
        canvasEnvironment,
        issuer: resolveCanvasIssuer(canvasEnvironment),
        clientId: requireTrimmedFormValue(
          formData.get("clientId"),
          "Canvas Client ID is required.",
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get("deploymentId"),
          "Canvas Deployment ID is required.",
        ),
      };
    }
    case "moodle":
      return {
        lms: "moodle",
        issuer: requireTrimmedFormValue(
          formData.get("issuer"),
          "Moodle Platform ID is required.",
        ),
        clientId: requireTrimmedFormValue(
          formData.get("clientId"),
          "Moodle Client ID is required.",
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get("deploymentId"),
          "Moodle Deployment ID is required.",
        ),
        authenticationRequestUrl: requireTrimmedFormValue(
          formData.get("authenticationRequestUrl"),
          "Moodle Authentication request URL is required.",
        ),
        accessTokenUrl: requireTrimmedFormValue(
          formData.get("accessTokenUrl"),
          "Moodle Access token URL is required.",
        ),
        jwksUrl: requireTrimmedFormValue(
          formData.get("jwksUrl"),
          "Moodle Public keyset URL is required.",
        ),
      };
    case "sakai":
      return {
        lms: "sakai",
        issuer: requireTrimmedFormValue(
          formData.get("issuer"),
          "Sakai Platform ID is required.",
        ),
        clientId: requireTrimmedFormValue(
          formData.get("clientId"),
          "Sakai Client ID is required.",
        ),
        deploymentId: requireTrimmedFormValue(
          formData.get("deploymentId"),
          "Sakai Deployment ID is required.",
        ),
        oidcAuthenticationUrl: requireTrimmedFormValue(
          formData.get("oidcAuthenticationUrl"),
          "Sakai OIDC authentication URL is required.",
        ),
        accessTokenUrl: requireTrimmedFormValue(
          formData.get("accessTokenUrl"),
          "Sakai Access token URL is required.",
        ),
        jwksUrl: requireTrimmedFormValue(
          formData.get("jwksUrl"),
          "Sakai Public keyset URL is required.",
        ),
      };
  }
}

function buildBindingAuditDetail(
  binding: DeploymentBinding,
): Record<string, string> {
  switch (binding.lms) {
    case "canvas":
      return {
        lms: binding.lms,
        canvasEnvironment: binding.canvasEnvironment,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
      };
    case "moodle":
      return {
        lms: binding.lms,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
        authenticationRequestUrl: binding.authenticationRequestUrl,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
    case "sakai":
      return {
        lms: binding.lms,
        issuer: binding.issuer,
        clientId: binding.clientId,
        deploymentId: binding.deploymentId,
        oidcAuthenticationUrl: binding.oidcAuthenticationUrl,
        accessTokenUrl: binding.accessTokenUrl,
        jwksUrl: binding.jwksUrl,
      };
  }
}

function formatLmsLabel(lms: LmsType): string {
  switch (lms) {
    case "canvas":
      return "Canvas";
    case "moodle":
      return "Moodle";
    case "sakai":
      return "Sakai";
  }
}
