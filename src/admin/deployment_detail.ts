import {
  approvalStatusClass,
  approvalStatusLabel,
  describeDeploymentPin,
} from "../package_review/summary.ts";
import type { CanvasEnvironmentOption } from "../lti/config.ts";
import { summarizePilotUsage } from "../ops/service.ts";
import type {
  ControlPlaneDeploymentDetailSnapshot,
  ControlPlaneHealthDimension,
  ControlPlaneHealthStatus,
  DeploymentActivitySnapshot,
  DeploymentGradePublicationSnapshot,
} from "../ops/types.ts";
import type {
  DeploymentRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import {
  type AdminNotice,
  escapeHtml,
  formatDateTime,
  renderAdminLayout,
} from "./layout.ts";

export interface DeploymentNrpsVerificationSummary {
  status: "succeeded" | "failed";
  checkedAt: string;
  contextId: string | null;
  memberCount: number | null;
}

export function buildDefaultDeploymentSeed(
  appId: string,
  appTitle: string,
): {
  slug: string;
  label: string;
} {
  return {
    slug: `${appId}-pilot`,
    label: `${appTitle} Pilot Deployment`,
  };
}

export function renderDeploymentDetailPage(input: {
  appId: string;
  appTitle: string;
  history: PackageVersionRecord[];
  deployment: DeploymentRecord | null;
  nrpsVerification?: DeploymentNrpsVerificationSummary | null;
  controlPlaneDetail?: ControlPlaneDeploymentDetailSnapshot | null;
  canvasConfigUrl?: string | null;
  supportedCanvasEnvironments?: CanvasEnvironmentOption[];
  notice?: AdminNotice | null;
}): string {
  const seed = buildDefaultDeploymentSeed(input.appId, input.appTitle);
  const approvedVersions = input.history.filter((version) =>
    version.approvalStatus === "approved"
  );
  const activeDeployment = input.deployment ?? {
    id: 0,
    slug: seed.slug,
    label: seed.label,
    appId: input.appId,
    enabledPackageVersionId: null,
    enabledPackageVersion: null,
    binding: null,
    updatedAt: input.history[0]?.importedAt ?? new Date().toISOString(),
  };
  const canvasConfigUrl = input.canvasConfigUrl ?? null;
  const nrpsVerification = input.nrpsVerification ?? null;
  const controlPlaneDetail = input.controlPlaneDetail ?? null;
  const supportedCanvasEnvironments = input.supportedCanvasEnvironments ?? [];
  const launchReady = activeDeployment.enabledPackageVersionId !== null &&
    activeDeployment.binding !== null &&
    canvasConfigUrl !== null;
  const rosterVerificationHeading = nrpsVerification === null
    ? "Roster access not verified yet"
    : nrpsVerification.status === "succeeded"
    ? "Latest roster read succeeded"
    : "Latest roster read failed";
  const installStatusHeading = activeDeployment.binding === null
    ? "Canvas binding not saved yet"
    : launchReady
    ? "Launch-ready configuration saved"
    : "Canvas binding saved, finish release setup";

  return renderAdminLayout({
    title: `${input.appTitle} Deployment`,
    eyebrow: "Canvas Deployment",
    heading: activeDeployment.label,
    intro:
      "Pin the reviewed version, then wire this deployment into Canvas through one supported LTI 1.3 path. Lantern keeps both the release choice and the Canvas binding explicit.",
    breadcrumbs: [
      { label: "Packages", href: "/admin/packages" },
      {
        label: input.appTitle,
        href: `/admin/packages/${input.appId}/versions/${
          input.history[0]?.version ?? ""
        }`,
      },
      { label: "Deployment" },
    ],
    notice: input.notice ?? null,
    body: `${renderControlPlaneStatusSection(controlPlaneDetail)}
    ${renderPilotUsageSection(controlPlaneDetail)}
    <section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Current pin</p>
          <h2>${escapeHtml(describeDeploymentPin(input.deployment))}</h2>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Slug</span>
              <span class="fact-value">${
      escapeHtml(activeDeployment.slug)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">App ID</span>
              <span class="fact-value">${
      escapeHtml(activeDeployment.appId)
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Updated</span>
              <span class="fact-value">${
      escapeHtml(formatDateTime(activeDeployment.updatedAt))
    }</span>
            </div>
          </div>
          <div class="callout">
            <h3>Release gate</h3>
            <p>Only versions that are already approved appear in the picker. Pending and rejected versions stay visible in history, but they cannot become active pins.</p>
          </div>
        </div>
        <section class="stack">
          <p class="section-label">Canvas status</p>
          <h2>${escapeHtml(installStatusHeading)}</h2>
          <div class="facts">
            <div class="fact">
              <span class="fact-label">Launch readiness</span>
              <span class="fact-value">${
      launchReady ? "Ready for Canvas launch" : "Needs configuration"
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas environment</span>
              <span class="fact-value">${
      escapeHtml(
        describeBindingValue(activeDeployment.binding?.canvasEnvironment),
      )
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas issuer</span>
              <span class="fact-value">${
      escapeHtml(describeBindingValue(activeDeployment.binding?.issuer))
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas Client ID</span>
              <span class="fact-value">${
      escapeHtml(describeBindingValue(activeDeployment.binding?.clientId))
    }</span>
            </div>
            <div class="fact">
              <span class="fact-label">Canvas Deployment ID</span>
              <span class="fact-value">${
      escapeHtml(describeBindingValue(activeDeployment.binding?.deploymentId))
    }</span>
            </div>
          </div>
          <p class="micro muted">A deployment is launch-ready only after Lantern has both an exact approved version pin and an exact Canvas binding.</p>
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Canvas install</p>
          <h2>One supported setup path</h2>
          <div class="step-list">
            <article class="step-card">
              <p class="section-label">Step 1</p>
              <h3>Copy Lantern's config URL into Canvas</h3>
              <p>Use the hosted Lantern config document when you create the developer key or external tool in Canvas. Lantern publishes one supported pilot configuration.</p>
              <div class="fact">
                <span class="fact-label">Config URL</span>
                <code class="inline-code">${
      escapeHtml(
        canvasConfigUrl ??
          "APP_ORIGIN is required before Lantern can publish the config URL.",
      )
    }</code>
              </div>
            </article>
            <article class="step-card">
              <p class="section-label">Step 2</p>
              <h3>Deploy the tool in Canvas</h3>
              <p>Finish the Canvas-side setup through the single supported placement, then note the exact Client ID and Deployment ID that Canvas assigns.</p>
            </article>
            <article class="step-card">
              <p class="section-label">Step 3</p>
              <h3>Save the exact Canvas binding in Lantern</h3>
              <p>Return here and record the exact environment, Client ID, and Deployment ID. Lantern binds launches only through those saved identifiers.</p>
            </article>
          </div>
          ${
      canvasConfigUrl === null
        ? `<div class="callout">
              <h3>Config URL unavailable</h3>
              <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt the Canvas install flow. Lantern will not guess public launch URLs from the local request.</p>
            </div>`
        : ""
    }
        </div>
        <section class="stack">
          <p class="section-label">Canvas binding</p>
          <form method="post" action="/admin/packages/${
      escapeHtml(input.appId)
    }/deployment/install" class="stack">
            <div class="field">
              <label for="canvas-environment">Canvas environment</label>
              <select id="canvas-environment" name="canvasEnvironment" ${
      canvasConfigUrl === null ? "disabled" : ""
    }>
                ${
      supportedCanvasEnvironments.map((environment) =>
        `<option value="${escapeHtml(environment.id)}" ${
          activeDeployment.binding?.canvasEnvironment === environment.id
            ? "selected"
            : ""
        }>${escapeHtml(environment.label)}</option>`
      ).join("")
    }
              </select>
              <p class="field-hint">Pick the hosted Canvas environment this deployment will use. Lantern stores the matching issuer value behind the scenes.</p>
            </div>
            <div class="field">
              <label for="client-id">Canvas Client ID</label>
              <input
                id="client-id"
                name="clientId"
                type="text"
                value="${escapeHtml(activeDeployment.binding?.clientId ?? "")}"
                placeholder="10000000000001"
                ${canvasConfigUrl === null ? "disabled" : ""}
              />
              <p class="field-hint">Paste the exact Client ID Canvas assigned when you created the tool.</p>
            </div>
            <div class="field">
              <label for="deployment-id">Canvas Deployment ID</label>
              <input
                id="deployment-id"
                name="deploymentId"
                type="text"
                value="${
      escapeHtml(activeDeployment.binding?.deploymentId ?? "")
    }"
                placeholder="deployment-123"
                ${canvasConfigUrl === null ? "disabled" : ""}
              />
              <p class="field-hint">Paste the exact Deployment ID for this Canvas placement. Lantern does not infer deployments from course or client data alone.</p>
            </div>
            <div class="button-row">
              <button type="submit" class="button-primary" ${
      canvasConfigUrl === null ? "disabled" : ""
    }>Save Canvas binding</button>
              <a class="button-ghost" href="/admin/packages/${
      escapeHtml(input.appId)
    }/versions/${
      escapeHtml(input.history[0]?.version ?? "")
    }">Back to dossier</a>
            </div>
          </form>
          <p class="micro muted">Lantern records the exact Canvas identifiers and keeps them visible on reload so the install path stays auditable.</p>
          <div class="callout">
            <h3>Roster access proof</h3>
            <p>${escapeHtml(rosterVerificationHeading)}</p>
            <div class="facts">
              <div class="fact">
                <span class="fact-label">Last check</span>
                <span class="fact-value">${
      escapeHtml(
        nrpsVerification === null
          ? "Not run yet"
          : formatDateTime(nrpsVerification.checkedAt),
      )
    }</span>
              </div>
              <div class="fact">
                <span class="fact-label">Context ID</span>
                <span class="fact-value">${
      escapeHtml(
        nrpsVerification?.contextId ?? "Latest launch context required",
      )
    }</span>
              </div>
              <div class="fact">
                <span class="fact-label">Member count</span>
                <span class="fact-value">${
      escapeHtml(
        nrpsVerification?.memberCount === null ||
          nrpsVerification?.memberCount === undefined
          ? "Not recorded"
          : String(nrpsVerification.memberCount),
      )
    }</span>
              </div>
              <div class="fact">
                <span class="fact-label">Status</span>
                <span class="fact-value">${
      escapeHtml(
        nrpsVerification === null
          ? "Pending verification"
          : nrpsVerification.status === "succeeded"
          ? "Succeeded"
          : "Failed",
      )
    }</span>
              </div>
            </div>
            <form method="post" action="/admin/packages/${
      escapeHtml(input.appId)
    }/deployment/verify-roster" class="stack">
              <div class="button-row">
                <button type="submit" class="button-secondary" ${
      activeDeployment.binding === null ? "disabled" : ""
    }>Verify roster access</button>
              </div>
            </form>
            <p class="micro muted">Lantern uses the latest launch-captured NRPS URL for this deployment and stores only a small verification summary.</p>
          </div>
          <p class="section-label">Version picker</p>
          <form method="post" action="/admin/packages/${
      escapeHtml(input.appId)
    }/deployment/pin" class="stack">
            <div class="field">
              <label for="package-version-id">Approved version</label>
              <select id="package-version-id" name="packageVersionId" ${
      approvedVersions.length === 0 ? "disabled" : ""
    }>
                ${
      approvedVersions.length === 0
        ? `<option value="">No approved versions available yet</option>`
        : approvedVersions.map((version) =>
          `<option value="${escapeHtml(String(version.id))}" ${
            activeDeployment.enabledPackageVersionId === version.id
              ? "selected"
              : ""
          }>Version ${escapeHtml(version.version)} · ${
            escapeHtml(version.title)
          }</option>`
        ).join("")
    }
              </select>
            </div>
            <div class="button-row">
              <button type="submit" class="button-primary" ${
      approvedVersions.length === 0 ? "disabled" : ""
    }>Save exact version pin</button>
              <a class="button-ghost" href="/admin/packages/${
      escapeHtml(input.appId)
    }/versions/${
      escapeHtml(input.history[0]?.version ?? "")
    }">Back to dossier</a>
            </div>
          </form>
          <p class="micro muted">Saving records the exact package version id and leaves the active pin visible on reload.</p>
        </section>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Version history</p>
        <div class="table-list">
          ${
      input.history.map((version) =>
        renderHistoryRow(activeDeployment, version)
      ).join("")
    }
        </div>
      </div>
    </section>`,
  });
}

function renderHistoryRow(
  deployment: Pick<DeploymentRecord, "enabledPackageVersionId">,
  version: PackageVersionRecord,
): string {
  const isPinned = deployment.enabledPackageVersionId === version.id;

  return `<article class="table-row">
    <div class="table-row-top">
      <p class="line-title">
        <span>Version ${escapeHtml(version.version)}</span>
        <span class="${approvalStatusClass(version.approvalStatus)}">${
    escapeHtml(approvalStatusLabel(version.approvalStatus))
  }</span>
        ${isPinned ? `<span class="chip">Active pin</span>` : ""}
      </p>
      <p class="micro muted">${
    escapeHtml(formatDateTime(version.importedAt))
  }</p>
    </div>
    <p class="line-copy">${
    escapeHtml(version.reviewNotes ?? "No review notes recorded.")
  }</p>
  </article>`;
}

function describeBindingValue(value: string | null | undefined): string {
  if (!value) {
    return "Not saved yet";
  }

  return value;
}

function renderControlPlaneStatusSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const health = detail?.inventory.health ?? null;

  return `<section class="panel">
      <div class="panel-body two-column">
        <div class="stack">
          <p class="section-label">Operations</p>
          <h2>Current status</h2>
          <p>Keep the deployment's release state, latest launch evidence, latest AGS write, and latest NRPS read on one governed admin page.</p>
          <div class="facts">
            ${
    renderActivityFact(
      "Overall status",
      describeOverallStatus(health?.overallStatus ?? null),
      health?.summary ?? "No control-plane status has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Last launch",
      formatActivityTimestamp(detail?.latestLaunch),
      detail?.latestLaunch?.summary ?? "No launch has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Last AGS write",
      formatGradePublicationTimestamp(detail?.latestGradePublish),
      detail?.latestGradePublish
        ? describeGradePublication(detail.latestGradePublish)
        : "No grade publish has been recorded yet.",
    )
  }
            ${
    renderActivityFact(
      "Last NRPS read",
      formatActivityTimestamp(detail?.latestNrpsRead),
      detail?.latestNrpsRead?.summary ?? "Roster verification has not run yet.",
    )
  }
          </div>
        </div>
        <section class="stack">
          <p class="section-label">Status dimensions</p>
          <h2>Readable control-plane facts</h2>
          <div class="table-list">
            ${renderDimensionRow("Review", health?.dimensions.review ?? null)}
            ${
    renderDimensionRow("Enablement", health?.dimensions.enablement ?? null)
  }
            ${renderDimensionRow("Launch", health?.dimensions.launch ?? null)}
            ${
    renderDimensionRow(
      "AGS publish",
      health?.dimensions.gradePublication ?? null,
    )
  }
            ${renderDimensionRow("NRPS", health?.dimensions.nrps ?? null)}
          </div>
        </section>
      </div>
    </section>`;
}

function renderPilotUsageSection(
  detail: ControlPlaneDeploymentDetailSnapshot | null,
): string {
  const pilotUsageFacts = detail === null
    ? [
      { label: "Launches recorded", value: "0" },
      { label: "Attempts completed", value: "0" },
      { label: "Grade publishes", value: "0 passed / 0 failed" },
      { label: "Recent active users", value: "0" },
    ]
    : summarizePilotUsage(detail.pilotUsage);

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Pilot usage</p>
        <h2>Basic activity from durable evidence</h2>
        <p>Counts stay deliberately small: launches, completed attempts, governed grade publishes, and recent active learners for this deployment.</p>
        <div class="facts">
          ${
    pilotUsageFacts.map((fact) =>
      `<div class="fact">
              <span class="fact-label">${escapeHtml(fact.label)}</span>
              <span class="fact-value">${escapeHtml(fact.value)}</span>
            </div>`
    ).join("")
  }
        </div>
      </div>
    </section>`;
}

function renderActivityFact(
  label: string,
  value: string,
  summary: string,
): string {
  return `<div class="fact">
      <span class="fact-label">${escapeHtml(label)}</span>
      <span class="fact-value">${escapeHtml(value)}</span>
      <p class="micro muted">${escapeHtml(summary)}</p>
    </div>`;
}

function renderDimensionRow(
  label: string,
  dimension: ControlPlaneHealthDimension | null,
): string {
  const status = dimension === null ? "Unknown" : describeDimensionStatus(
    dimension.status,
  );
  const summary = dimension?.summary ??
    "No control-plane evidence has been recorded for this dimension yet.";
  const checkedAt =
    dimension?.checkedAt === null || dimension?.checkedAt === undefined
      ? "Not recorded yet"
      : formatDateTime(dimension.checkedAt);

  return `<article class="table-row">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(label)}</span>
          <span class="chip">${escapeHtml(status)}</span>
        </p>
        <p class="micro muted">${escapeHtml(checkedAt)}</p>
      </div>
      <p class="line-copy">${escapeHtml(summary)}</p>
    </article>`;
}

function formatActivityTimestamp(
  snapshot: DeploymentActivitySnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.occurredAt);
}

function formatGradePublicationTimestamp(
  snapshot: DeploymentGradePublicationSnapshot | null | undefined,
): string {
  if (snapshot === null || snapshot === undefined) {
    return "Not recorded yet";
  }

  return formatDateTime(snapshot.publishedAt ?? snapshot.updatedAt);
}

function describeGradePublication(
  snapshot: DeploymentGradePublicationSnapshot,
): string {
  switch (snapshot.status) {
    case "published":
      return "Latest grade publish succeeded.";
    case "pending":
      return "Latest grade publish is still pending.";
    case "failed":
      return "Latest grade publish failed and may need retry.";
  }
}

function describeOverallStatus(
  status: ControlPlaneHealthStatus | null,
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs follow-up";
    case "failed":
      return "Failed";
    case "unknown":
    case null:
      return "Not recorded yet";
  }
}

function describeDimensionStatus(
  status: ControlPlaneHealthStatus,
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Needs follow-up";
    case "failed":
      return "Failed";
    case "unknown":
      return "Unknown";
  }
}
