import { describeDeploymentPin } from "../package_review/summary.ts";
import type { CanvasEnvironmentOption } from "../lti/config.ts";
import type {
  CanvasDeploymentBinding,
  DeploymentBinding,
} from "../lti/types.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";
import type {
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from "./deployment_detail.ts";

export function renderManagedDeploymentSections(input: {
  appId: string;
  slots: ManagedDeploymentSlot[];
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Managed deployment slots</p>
        <h2>Canvas, Moodle, and Sakai stay separate</h2>
        <p>Each slot keeps its own reviewed version pin and exact LMS binding. Shared status above stays neutral while the forms below remain LMS-specific.</p>
        <div class="step-list">
          ${
    input.slots
      .map((slot) =>
        renderDeploymentCard({
          appId: input.appId,
          slot,
          nrpsVerification: input.nrpsVerification,
          canvasConfigUrl: input.canvasConfigUrl,
          supportedCanvasEnvironments: input.supportedCanvasEnvironments,
          approvedVersions: input.approvedVersions,
          history: input.history,
        })
      )
      .join("")
  }
        </div>
      </div>
    </section>`;
}

function renderDeploymentCard(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  const lmsLabel = formatLmsLabel(input.slot.lms);
  const bindingStatusHeading = describeBindingStatusHeading(
    input.slot,
    input.canvasConfigUrl,
  );
  const pinStatus = describeDeploymentPin(
    input.slot.persisted ? input.slot.deployment : null,
  );

  return `<article class="step-card stack">
      <div class="table-row-top">
        <p class="line-title">
          <span>${escapeHtml(lmsLabel)} deployment</span>
          <span class="chip">${escapeHtml(bindingStatusHeading)}</span>
        </p>
        <p class="micro muted">${
    escapeHtml(
      input.slot.persisted
        ? `Updated ${formatDateTime(input.slot.deployment.updatedAt)}`
        : "System-owned slot not saved yet",
    )
  }</p>
      </div>
      <p>${escapeHtml(describeManagedSlotIntro(input.slot.lms))}</p>
      <div class="facts">
        <div class="fact">
          <span class="fact-label">Slot slug</span>
          <span class="fact-value">${
    escapeHtml(input.slot.deployment.slug)
  }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Version pin</span>
          <span class="fact-value">${escapeHtml(pinStatus)}</span>
        </div>
        ${renderBindingFacts(input.slot)}
      </div>
      ${renderInstallForm(input)}
      ${
    input.slot.lms === "canvas"
      ? renderCanvasRosterVerification(
        input.appId,
        input.slot,
        input.nrpsVerification,
      )
      : ""
  }
      ${
    renderVersionPinForm(
      input.appId,
      input.slot,
      input.approvedVersions,
      input.history,
    )
  }
    </article>`;
}

function renderInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  switch (input.slot.lms) {
    case "canvas":
      return renderCanvasInstallForm(input);
    case "moodle":
      return renderMoodleInstallForm(input);
    case "sakai":
      return renderSakaiInstallForm(input);
  }
}

function renderCanvasInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  history: PackageVersionRecord[];
}): string {
  const binding = getCanvasBinding(input.slot.deployment.binding);

  return `<div class="stack">
      <p class="section-label">Canvas binding</p>
      <div class="callout">
        <h3>One supported Canvas setup path</h3>
        <p>Use Lantern's hosted config URL when you create the developer key or external tool in Canvas, then save the exact environment, Client ID, and Deployment ID here.</p>
        <div class="fact">
          <span class="fact-label">Config URL</span>
          <code class="inline-code">${
    escapeHtml(
      input.canvasConfigUrl ??
        "APP_ORIGIN is required before Lantern can publish the config URL.",
    )
  }</code>
        </div>
      </div>
      ${
    input.canvasConfigUrl === null
      ? `<div class="callout">
          <h3>Config URL unavailable</h3>
          <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt the Canvas install flow. Lantern will not guess public launch URLs from the local request.</p>
        </div>`
      : ""
  }
      <form method="post" action="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/deployment/install" class="stack">
        <input type="hidden" name="lms" value="canvas" />
        <div class="field">
          <label for="canvas-environment">Canvas environment</label>
          <select id="canvas-environment" name="canvasEnvironment" ${
    input.canvasConfigUrl === null ? "disabled" : ""
  }>
            ${
    input.supportedCanvasEnvironments
      .map(
        (environment) =>
          `<option value="${escapeHtml(environment.id)}" ${
            binding?.canvasEnvironment === environment.id ? "selected" : ""
          }>${escapeHtml(environment.label)}</option>`,
      )
      .join("")
  }
          </select>
          <p class="field-hint">Pick the hosted Canvas environment this deployment will use. Lantern stores the matching issuer value behind the scenes.</p>
        </div>
        <div class="field">
          <label for="canvas-client-id">Canvas Client ID</label>
          <input
            id="canvas-client-id"
            name="clientId"
            type="text"
            value="${escapeHtml(binding?.clientId ?? "")}"
            placeholder="10000000000001"
            ${input.canvasConfigUrl === null ? "disabled" : ""}
          />
          <p class="field-hint">Paste the exact Client ID Canvas assigned when you created the tool.</p>
        </div>
        <div class="field">
          <label for="canvas-deployment-id">Canvas Deployment ID</label>
          <input
            id="canvas-deployment-id"
            name="deploymentId"
            type="text"
            value="${escapeHtml(binding?.deploymentId ?? "")}"
            placeholder="deployment-123"
            ${input.canvasConfigUrl === null ? "disabled" : ""}
          />
          <p class="field-hint">Paste the exact Deployment ID for this Canvas placement. Lantern does not infer deployments from course or client data alone.</p>
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary" ${
    input.canvasConfigUrl === null ? "disabled" : ""
  }>Save Canvas binding</button>
          <a class="button-ghost" href="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/versions/${escapeHtml(input.history[0]?.version ?? "")}">Back to dossier</a>
        </div>
      </form>
      <p class="micro muted">Lantern records the exact Canvas identifiers and keeps them visible on reload so the install path stays auditable.</p>
    </div>`;
}

function renderMoodleInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  history: PackageVersionRecord[];
}): string {
  const binding = getMoodleBinding(input.slot.deployment.binding);

  return `<div class="stack">
      <p class="section-label">Moodle binding</p>
      <div class="callout">
        <h3>Save the exact Moodle values</h3>
        <p>Copy the exact Platform ID, Client ID, Deployment ID, Authentication request URL, Access token URL, and Public keyset URL from Moodle. Lantern does not guess endpoints from issuer strings.</p>
      </div>
      <form method="post" action="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/deployment/install" class="stack">
        <input type="hidden" name="lms" value="moodle" />
        <div class="field">
          <label for="moodle-issuer">Platform ID</label>
          <input
            id="moodle-issuer"
            name="issuer"
            type="text"
            value="${escapeHtml(binding?.issuer ?? "")}"
            placeholder="https://moodle.example"
          />
        </div>
        <div class="field">
          <label for="moodle-client-id">Client ID</label>
          <input
            id="moodle-client-id"
            name="clientId"
            type="text"
            value="${escapeHtml(binding?.clientId ?? "")}"
            placeholder="moodle-client-123"
          />
        </div>
        <div class="field">
          <label for="moodle-deployment-id">Deployment ID</label>
          <input
            id="moodle-deployment-id"
            name="deploymentId"
            type="text"
            value="${escapeHtml(binding?.deploymentId ?? "")}"
            placeholder="moodle-deployment-123"
          />
        </div>
        <div class="field">
          <label for="moodle-authentication-request-url">Authentication request URL</label>
          <input
            id="moodle-authentication-request-url"
            name="authenticationRequestUrl"
            type="text"
            value="${escapeHtml(binding?.authenticationRequestUrl ?? "")}"
            placeholder="https://moodle.example/mod/lti/auth.php"
          />
        </div>
        <div class="field">
          <label for="moodle-access-token-url">Access token URL</label>
          <input
            id="moodle-access-token-url"
            name="accessTokenUrl"
            type="text"
            value="${escapeHtml(binding?.accessTokenUrl ?? "")}"
            placeholder="https://moodle.example/mod/lti/token.php"
          />
        </div>
        <div class="field">
          <label for="moodle-jwks-url">Public keyset URL</label>
          <input
            id="moodle-jwks-url"
            name="jwksUrl"
            type="text"
            value="${escapeHtml(binding?.jwksUrl ?? "")}"
            placeholder="https://moodle.example/mod/lti/certs.php"
          />
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary">Save exact Moodle binding</button>
          <a class="button-ghost" href="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/versions/${escapeHtml(input.history[0]?.version ?? "")}">Back to dossier</a>
        </div>
      </form>
    </div>`;
}

function renderSakaiInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  history: PackageVersionRecord[];
}): string {
  const binding = getSakaiBinding(input.slot.deployment.binding);

  return `<div class="stack">
      <p class="section-label">Sakai binding</p>
      <div class="callout">
        <h3>Save the exact Sakai values</h3>
        <p>Copy the exact Platform ID, Client ID, Deployment ID, OIDC authentication URL, Access token URL, and Public keyset URL from Sakai. Confirm the admin-facing source of <code class="inline-code">deployment_id</code> before sign-off.</p>
      </div>
      <form method="post" action="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/deployment/install" class="stack">
        <input type="hidden" name="lms" value="sakai" />
        <div class="field">
          <label for="sakai-issuer">Platform ID</label>
          <input
            id="sakai-issuer"
            name="issuer"
            type="text"
            value="${escapeHtml(binding?.issuer ?? "")}"
            placeholder="https://sakai.example"
          />
        </div>
        <div class="field">
          <label for="sakai-client-id">Client ID</label>
          <input
            id="sakai-client-id"
            name="clientId"
            type="text"
            value="${escapeHtml(binding?.clientId ?? "")}"
            placeholder="sakai-client-123"
          />
        </div>
        <div class="field">
          <label for="sakai-deployment-id">Deployment ID</label>
          <input
            id="sakai-deployment-id"
            name="deploymentId"
            type="text"
            value="${escapeHtml(binding?.deploymentId ?? "")}"
            placeholder="sakai-deployment-123"
          />
        </div>
        <div class="field">
          <label for="sakai-oidc-authentication-url">OIDC authentication URL</label>
          <input
            id="sakai-oidc-authentication-url"
            name="oidcAuthenticationUrl"
            type="text"
            value="${escapeHtml(binding?.oidcAuthenticationUrl ?? "")}"
            placeholder="https://sakai.example/imsoidc/lti13/oidc_auth"
          />
        </div>
        <div class="field">
          <label for="sakai-access-token-url">Access token URL</label>
          <input
            id="sakai-access-token-url"
            name="accessTokenUrl"
            type="text"
            value="${escapeHtml(binding?.accessTokenUrl ?? "")}"
            placeholder="https://sakai.example/imsblis/lti13/token/3"
          />
        </div>
        <div class="field">
          <label for="sakai-jwks-url">Public keyset URL</label>
          <input
            id="sakai-jwks-url"
            name="jwksUrl"
            type="text"
            value="${escapeHtml(binding?.jwksUrl ?? "")}"
            placeholder="https://sakai.example/imsblis/lti13/keyset"
          />
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary">Save exact Sakai binding</button>
          <a class="button-ghost" href="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/versions/${escapeHtml(input.history[0]?.version ?? "")}">Back to dossier</a>
        </div>
      </form>
    </div>`;
}

function renderCanvasRosterVerification(
  appId: string,
  slot: ManagedDeploymentSlot,
  nrpsVerification: DeploymentNrpsVerificationSummary | null,
): string {
  const rosterVerificationHeading = nrpsVerification === null
    ? "Roster access not verified yet"
    : nrpsVerification.status === "succeeded"
    ? "Latest roster read succeeded"
    : "Latest roster read failed";

  return `<div class="callout">
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
    escapeHtml(
      appId,
    )
  }/deployment/verify-roster" class="stack">
        <div class="button-row">
          <button type="submit" class="button-secondary" ${
    getCanvasBinding(slot.deployment.binding) === null ? "disabled" : ""
  }>Verify roster access</button>
        </div>
      </form>
      <p class="micro muted">Lantern uses the latest launch-captured NRPS URL for the Canvas slot and stores only a small verification summary.</p>
    </div>`;
}

function renderVersionPinForm(
  appId: string,
  slot: ManagedDeploymentSlot,
  approvedVersions: PackageVersionRecord[],
  history: PackageVersionRecord[],
): string {
  return `<div class="stack">
      <p class="section-label">Version pin</p>
      <form method="post" action="/admin/packages/${
    escapeHtml(appId)
  }/deployment/pin" class="stack">
        <input type="hidden" name="lms" value="${escapeHtml(slot.lms)}" />
        <div class="field">
          <label for="${
    escapeHtml(slot.lms)
  }-package-version-id">Approved version</label>
          <select id="${
    escapeHtml(slot.lms)
  }-package-version-id" name="packageVersionId" ${
    approvedVersions.length === 0 ? "disabled" : ""
  }>
            ${
    approvedVersions.length === 0
      ? `<option value="">No approved versions available yet</option>`
      : approvedVersions
        .map(
          (version) =>
            `<option value="${escapeHtml(String(version.id))}" ${
              slot.deployment.enabledPackageVersionId === version.id
                ? "selected"
                : ""
            }>Version ${escapeHtml(version.version)} · ${
              escapeHtml(version.title)
            }</option>`,
        )
        .join("")
  }
          </select>
          <p class="field-hint">Only versions that are already approved appear in the picker. Pending and rejected versions stay visible in history, but they cannot become active pins.</p>
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary" ${
    approvedVersions.length === 0 ? "disabled" : ""
  }>Save exact version pin</button>
          <a class="button-ghost" href="/admin/packages/${
    escapeHtml(
      appId,
    )
  }/versions/${escapeHtml(history[0]?.version ?? "")}">Back to dossier</a>
        </div>
      </form>
      <p class="micro muted">Saving records the exact package version id and leaves the active pin visible on reload.</p>
    </div>`;
}

function renderBindingFacts(slot: ManagedDeploymentSlot): string {
  switch (slot.lms) {
    case "canvas": {
      const binding = getCanvasBinding(slot.deployment.binding);
      return `
        <div class="fact">
          <span class="fact-label">Canvas environment</span>
          <span class="fact-value">${
        escapeHtml(
          describeBindingValue(binding?.canvasEnvironment),
        )
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Canvas issuer</span>
          <span class="fact-value">${
        escapeHtml(describeBindingValue(binding?.issuer))
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Canvas Client ID</span>
          <span class="fact-value">${
        escapeHtml(describeBindingValue(binding?.clientId))
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Canvas Deployment ID</span>
          <span class="fact-value">${
        escapeHtml(
          describeBindingValue(binding?.deploymentId),
        )
      }</span>
        </div>`;
    }
    case "moodle": {
      const binding = getMoodleBinding(slot.deployment.binding);
      return `
        <div class="fact">
          <span class="fact-label">Platform ID</span>
          <span class="fact-value">${
        escapeHtml(describeBindingValue(binding?.issuer))
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Client ID</span>
          <span class="fact-value">${
        escapeHtml(describeBindingValue(binding?.clientId))
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Deployment ID</span>
          <span class="fact-value">${
        escapeHtml(
          describeBindingValue(binding?.deploymentId),
        )
      }</span>
        </div>`;
    }
    case "sakai": {
      const binding = getSakaiBinding(slot.deployment.binding);
      return `
        <div class="fact">
          <span class="fact-label">Platform ID</span>
          <span class="fact-value">${
        escapeHtml(describeBindingValue(binding?.issuer))
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Client ID</span>
          <span class="fact-value">${
        escapeHtml(describeBindingValue(binding?.clientId))
      }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Deployment ID</span>
          <span class="fact-value">${
        escapeHtml(
          describeBindingValue(binding?.deploymentId),
        )
      }</span>
        </div>`;
    }
  }
}

function describeBindingStatusHeading(
  slot: ManagedDeploymentSlot,
  canvasConfigUrl: string | null,
): string {
  switch (slot.lms) {
    case "canvas":
      if (getCanvasBinding(slot.deployment.binding) === null) {
        return "Canvas binding not saved yet";
      }

      return slot.deployment.enabledPackageVersionId !== null &&
          canvasConfigUrl !== null
        ? "Launch-ready configuration saved"
        : "Canvas binding saved, finish release setup";
    case "moodle":
      return getMoodleBinding(slot.deployment.binding) === null
        ? "Moodle binding not saved yet"
        : "Exact Moodle binding saved";
    case "sakai":
      return getSakaiBinding(slot.deployment.binding) === null
        ? "Sakai binding not saved yet"
        : "Exact Sakai binding saved";
  }
}

function describeManagedSlotIntro(lms: ManagedDeploymentSlot["lms"]): string {
  switch (lms) {
    case "canvas":
      return "Keep the hosted Canvas config URL, saved environment, and roster verification on the same page.";
    case "moodle":
      return "Save the exact Moodle binding values here without Canvas-only copy or guessed endpoints.";
    case "sakai":
      return "Save the exact Sakai binding values here and keep the admin-facing deployment_id guidance explicit.";
  }
}

function formatLmsLabel(lms: ManagedDeploymentSlot["lms"]): string {
  switch (lms) {
    case "canvas":
      return "Canvas";
    case "moodle":
      return "Moodle";
    case "sakai":
      return "Sakai";
  }
}

function getCanvasBinding(
  binding: DeploymentBinding | null,
): CanvasDeploymentBinding | null {
  return binding?.lms === "canvas" ? binding : null;
}

function getMoodleBinding(
  binding: DeploymentBinding | null,
): Extract<DeploymentBinding, { lms: "moodle" }> | null {
  return binding?.lms === "moodle" ? binding : null;
}

function getSakaiBinding(
  binding: DeploymentBinding | null,
): Extract<DeploymentBinding, { lms: "sakai" }> | null {
  return binding?.lms === "sakai" ? binding : null;
}

function describeBindingValue(value: string | null | undefined): string {
  if (!value) {
    return "Not saved yet";
  }

  return value;
}
