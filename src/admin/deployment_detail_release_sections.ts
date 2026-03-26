import { describeDeploymentPin } from "../package_review/summary.ts";
import type { CanvasEnvironmentOption } from "../lti/config.ts";
import type {
  CanvasDeploymentBinding,
  DeploymentBinding,
} from "../lti/types.ts";
import type { PackageVersionRecord } from "../package_review/types.ts";
import type { AdminNotice } from "./layout.ts";
import { escapeHtml, formatDateTime } from "./layout.ts";
import type {
  DeploymentEditorField,
  DeploymentEditorState,
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from "./deployment_detail.ts";

export function renderManagedDeploymentSections(input: {
  appId: string;
  slots: ManagedDeploymentSlot[];
  selectedLms: ManagedDeploymentSlot["lms"] | null;
  editorState: DeploymentEditorState | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  const selectedLms = resolveSelectedEditorLms(input.slots, input.selectedLms);
  const selectedSlot = getSelectedSlot(input.slots, selectedLms);

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">LMS slots</p>
        <div class="two-column">
          <div class="stack">
            <h2>Open one LMS slot at a time.</h2>
            <p>Each LMS keeps its own exact binding and reviewed version pin. Switch tabs instead of scanning three long forms on one page.</p>
          </div>
          <section class="fact">
            <span class="fact-label">Editor in view</span>
            <span class="fact-value">${
    escapeHtml(formatLmsLabel(selectedLms))
  }</span>
            <p class="micro muted">${
    escapeHtml(describeManagedSlotIntro(selectedLms))
  }</p>
          </section>
        </div>
        <nav class="deployment-tab-strip" aria-label="LMS slots">
          ${
    input.slots
      .map((slot) =>
        renderLmsTab({
          appId: input.appId,
          slot,
          selectedLms,
        })
      )
      .join("")
  }
        </nav>
        ${
    renderSelectedSlotPanel({
      appId: input.appId,
      slot: selectedSlot,
      editorState: input.editorState?.lms === selectedSlot.lms
        ? input.editorState
        : null,
      nrpsVerification: input.nrpsVerification,
      canvasConfigUrl: input.canvasConfigUrl,
      supportedCanvasEnvironments: input.supportedCanvasEnvironments,
      approvedVersions: input.approvedVersions,
      history: input.history,
    })
  }
      </div>
    </section>`;
}

function renderLmsTab(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  selectedLms: ManagedDeploymentSlot["lms"];
}): string {
  const lmsLabel = formatLmsLabel(input.slot.lms);
  const editorHref = `/admin/packages/${
    encodeURIComponent(input.appId)
  }/deployment?lms=${encodeURIComponent(input.slot.lms)}#slot-panel`;
  const bindingStatusHeading = describeBindingStatusHeading(input.slot);

  return `<a class="deployment-tab ${
    input.selectedLms === input.slot.lms ? "active" : ""
  }" href="${escapeHtml(editorHref)}" ${
    input.selectedLms === input.slot.lms ? 'aria-current="page"' : ""
  }>
      <span class="deployment-tab-label">${escapeHtml(lmsLabel)}</span>
      <span class="deployment-tab-note">${
    escapeHtml(bindingStatusHeading)
  }</span>
    </a>`;
}

function renderSelectedSlotPanel(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  const lmsLabel = formatLmsLabel(input.slot.lms);
  const bindingStatusHeading = describeBindingStatusHeading(input.slot);
  const pinStatus = describeDeploymentPin(
    input.slot.persisted ? input.slot.deployment : null,
  );

  return `<section id="slot-panel" class="deployment-tab-panel stack">
      <div class="table-row-top">
        <div class="stack">
          <p class="section-label">${escapeHtml(lmsLabel)} slot</p>
          <h2>${escapeHtml(lmsLabel)} setup</h2>
          <p class="deployment-form-note">${
    escapeHtml(describeManagedSlotIntro(input.slot.lms))
  }</p>
        </div>
        <span class="chip chip-flagged">${
    escapeHtml(bindingStatusHeading)
  }</span>
      </div>
      <div class="chip-row">
        <span class="chip">Slug ${escapeHtml(input.slot.deployment.slug)}</span>
        <span class="chip">${escapeHtml(pinStatus)}</span>
        <span class="chip">${
    escapeHtml(describeSavedBindingChip(input.slot))
  }</span>
      </div>
      <div class="deployment-tab-copy">
        <span class="deployment-tab-title">${escapeHtml(lmsLabel)} editor</span>
        <span class="deployment-tab-copy-text">${
    escapeHtml(describeEditorCopy(input.slot.lms))
  }</span>
      </div>
      ${renderInlineNotice(input.editorState?.notice ?? null)}
      <div class="deployment-tab-body stack">
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
      input.editorState,
      input.approvedVersions,
    )
  }
      </div>
    </section>`;
}

function renderInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
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
  editorState: DeploymentEditorState | null;
  canvasConfigUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  history: PackageVersionRecord[];
}): string {
  const binding = getCanvasBinding(input.slot.deployment.binding);

  return `<div class="stack">
      <p class="section-label">Setup</p>
      <p class="deployment-form-note">Use Lantern's hosted config URL when you create or update the Canvas tool, then save the environment, Client ID, and Deployment ID here.</p>
      ${renderSavedBindingSummary(input.slot)}
      <div class="fact">
        <span class="fact-label">Config URL</span>
        <code class="inline-code">${
    escapeHtml(
      input.canvasConfigUrl ??
        "APP_ORIGIN is required before Lantern can publish the config URL.",
    )
  }</code>
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
  } ${renderFieldAriaInvalid(input.editorState, "canvasEnvironment")}
  }>
            ${
    input.supportedCanvasEnvironments
      .map(
        (environment) =>
          `<option value="${escapeHtml(environment.id)}" ${
            resolveInstallValue(
                input.editorState,
                "canvasEnvironment",
                binding?.canvasEnvironment ?? null,
              ) === environment.id
              ? "selected"
              : ""
          }>${escapeHtml(environment.label)}</option>`,
      )
      .join("")
  }
          </select>
          <p class="field-hint">Lantern stores the matching issuer value behind the scenes.</p>
          ${renderFieldError(input.editorState, "canvasEnvironment")}
        </div>
        <div class="field">
          <label for="canvas-client-id">Canvas Client ID</label>
          <input
            id="canvas-client-id"
            name="clientId"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "clientId",
        binding?.clientId ?? null,
      ),
    )
  }"
            placeholder="10000000000001"
            ${input.canvasConfigUrl === null ? "disabled" : ""}
            ${renderFieldAriaInvalid(input.editorState, "clientId")}
          />
          <p class="field-hint">Paste the exact Client ID Canvas assigned to the tool.</p>
          ${renderFieldError(input.editorState, "clientId")}
        </div>
        <div class="field">
          <label for="canvas-deployment-id">Canvas Deployment ID</label>
          <input
            id="canvas-deployment-id"
            name="deploymentId"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "deploymentId",
        binding?.deploymentId ?? null,
      ),
    )
  }"
            placeholder="deployment-123"
            ${input.canvasConfigUrl === null ? "disabled" : ""}
            ${renderFieldAriaInvalid(input.editorState, "deploymentId")}
          />
          <p class="field-hint">Lantern does not infer deployments from course or client data alone.</p>
          ${renderFieldError(input.editorState, "deploymentId")}
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary" ${
    input.canvasConfigUrl === null ? "disabled" : ""
  }>Save Canvas</button>
        </div>
      </form>
    </div>`;
}

function renderMoodleInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
}): string {
  const binding = getMoodleBinding(input.slot.deployment.binding);

  return `<div class="stack">
      <p class="section-label">Setup</p>
      <p class="deployment-form-note">Paste the exact Moodle values. Lantern will not derive endpoints from the platform ID.</p>
      ${renderSavedBindingSummary(input.slot)}
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
            value="${
    escapeHtml(
      resolveInstallValue(input.editorState, "issuer", binding?.issuer ?? null),
    )
  }"
            placeholder="https://moodle.example"
            ${renderFieldAriaInvalid(input.editorState, "issuer")}
          />
          ${renderFieldError(input.editorState, "issuer")}
        </div>
        <div class="field">
          <label for="moodle-client-id">Client ID</label>
          <input
            id="moodle-client-id"
            name="clientId"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "clientId",
        binding?.clientId ?? null,
      ),
    )
  }"
            placeholder="moodle-client-123"
            ${renderFieldAriaInvalid(input.editorState, "clientId")}
          />
          ${renderFieldError(input.editorState, "clientId")}
        </div>
        <div class="field">
          <label for="moodle-deployment-id">Deployment ID</label>
          <input
            id="moodle-deployment-id"
            name="deploymentId"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "deploymentId",
        binding?.deploymentId ?? null,
      ),
    )
  }"
            placeholder="moodle-deployment-123"
            ${renderFieldAriaInvalid(input.editorState, "deploymentId")}
          />
          ${renderFieldError(input.editorState, "deploymentId")}
        </div>
        <div class="field">
          <label for="moodle-authentication-request-url">Authentication request URL</label>
          <input
            id="moodle-authentication-request-url"
            name="authenticationRequestUrl"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "authenticationRequestUrl",
        binding?.authenticationRequestUrl ?? null,
      ),
    )
  }"
            placeholder="https://moodle.example/mod/lti/auth.php"
            ${
    renderFieldAriaInvalid(input.editorState, "authenticationRequestUrl")
  }
          />
          ${renderFieldError(input.editorState, "authenticationRequestUrl")}
        </div>
        <div class="field">
          <label for="moodle-access-token-url">Access token URL</label>
          <input
            id="moodle-access-token-url"
            name="accessTokenUrl"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "accessTokenUrl",
        binding?.accessTokenUrl ?? null,
      ),
    )
  }"
            placeholder="https://moodle.example/mod/lti/token.php"
            ${renderFieldAriaInvalid(input.editorState, "accessTokenUrl")}
          />
          ${renderFieldError(input.editorState, "accessTokenUrl")}
        </div>
        <div class="field">
          <label for="moodle-jwks-url">Public keyset URL</label>
          <input
            id="moodle-jwks-url"
            name="jwksUrl"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "jwksUrl",
        binding?.jwksUrl ?? null,
      ),
    )
  }"
            placeholder="https://moodle.example/mod/lti/certs.php"
            ${renderFieldAriaInvalid(input.editorState, "jwksUrl")}
          />
          ${renderFieldError(input.editorState, "jwksUrl")}
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary">Save Moodle</button>
        </div>
      </form>
    </div>`;
}

function renderSakaiInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
}): string {
  const binding = getSakaiBinding(input.slot.deployment.binding);

  return `<div class="stack">
      <p class="section-label">Setup</p>
      <p class="deployment-form-note">Paste the exact Sakai values and confirm the admin-facing source of <code class="inline-code">deployment_id</code>.</p>
      ${renderSavedBindingSummary(input.slot)}
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
            value="${
    escapeHtml(
      resolveInstallValue(input.editorState, "issuer", binding?.issuer ?? null),
    )
  }"
            placeholder="https://sakai.example"
            ${renderFieldAriaInvalid(input.editorState, "issuer")}
          />
          ${renderFieldError(input.editorState, "issuer")}
        </div>
        <div class="field">
          <label for="sakai-client-id">Client ID</label>
          <input
            id="sakai-client-id"
            name="clientId"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "clientId",
        binding?.clientId ?? null,
      ),
    )
  }"
            placeholder="sakai-client-123"
            ${renderFieldAriaInvalid(input.editorState, "clientId")}
          />
          ${renderFieldError(input.editorState, "clientId")}
        </div>
        <div class="field">
          <label for="sakai-deployment-id">Deployment ID</label>
          <input
            id="sakai-deployment-id"
            name="deploymentId"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "deploymentId",
        binding?.deploymentId ?? null,
      ),
    )
  }"
            placeholder="sakai-deployment-123"
            ${renderFieldAriaInvalid(input.editorState, "deploymentId")}
          />
          ${renderFieldError(input.editorState, "deploymentId")}
        </div>
        <div class="field">
          <label for="sakai-oidc-authentication-url">OIDC authentication URL</label>
          <input
            id="sakai-oidc-authentication-url"
            name="oidcAuthenticationUrl"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "oidcAuthenticationUrl",
        binding?.oidcAuthenticationUrl ?? null,
      ),
    )
  }"
            placeholder="https://sakai.example/imsoidc/lti13/oidc_auth"
            ${
    renderFieldAriaInvalid(input.editorState, "oidcAuthenticationUrl")
  }
          />
          ${renderFieldError(input.editorState, "oidcAuthenticationUrl")}
        </div>
        <div class="field">
          <label for="sakai-access-token-url">Access token URL</label>
          <input
            id="sakai-access-token-url"
            name="accessTokenUrl"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "accessTokenUrl",
        binding?.accessTokenUrl ?? null,
      ),
    )
  }"
            placeholder="https://sakai.example/imsblis/lti13/token/3"
            ${renderFieldAriaInvalid(input.editorState, "accessTokenUrl")}
          />
          ${renderFieldError(input.editorState, "accessTokenUrl")}
        </div>
        <div class="field">
          <label for="sakai-jwks-url">Public keyset URL</label>
          <input
            id="sakai-jwks-url"
            name="jwksUrl"
            type="text"
            value="${
    escapeHtml(
      resolveInstallValue(
        input.editorState,
        "jwksUrl",
        binding?.jwksUrl ?? null,
      ),
    )
  }"
            placeholder="https://sakai.example/imsblis/lti13/keyset"
            ${renderFieldAriaInvalid(input.editorState, "jwksUrl")}
          />
          ${renderFieldError(input.editorState, "jwksUrl")}
        </div>
        <div class="button-row">
          <button type="submit" class="button-primary">Save Sakai</button>
        </div>
      </form>
    </div>`;
}

function renderCanvasRosterVerification(
  appId: string,
  slot: ManagedDeploymentSlot,
  nrpsVerification: DeploymentNrpsVerificationSummary | null,
): string {
  const rosterStatus = nrpsVerification === null
    ? "Not run yet"
    : nrpsVerification.status === "succeeded"
    ? "Succeeded"
    : "Failed";
  const rosterSummary = nrpsVerification === null
    ? "Run this after the Canvas slot has launched once."
    : `Last check ${formatDateTime(nrpsVerification.checkedAt)} · Context ${
      nrpsVerification.contextId ?? "not recorded"
    } · Members ${
      nrpsVerification.memberCount === null
        ? "not recorded"
        : nrpsVerification.memberCount
    }`;

  return `<div class="stack">
      <p class="section-label">Canvas service check</p>
      <div class="fact">
        <span class="fact-label">Roster access</span>
        <span class="fact-value">${escapeHtml(rosterStatus)}</span>
        <p class="micro muted">${escapeHtml(rosterSummary)}</p>
      </div>
      <form method="post" action="/admin/packages/${
    escapeHtml(
      appId,
    )
  }/deployment/verify-roster" class="stack">
        <div class="button-row">
          <button type="submit" class="button-secondary" ${
    getCanvasBinding(slot.deployment.binding) === null ? "disabled" : ""
  }>Run roster check</button>
        </div>
      </form>
    </div>`;
}

function renderVersionPinForm(
  appId: string,
  slot: ManagedDeploymentSlot,
  editorState: DeploymentEditorState | null,
  approvedVersions: PackageVersionRecord[],
): string {
  const bindingSaved = hasSavedBinding(slot);
  const pinEnabled = bindingSaved && approvedVersions.length > 0;
  const pinHint = !bindingSaved
    ? "Save the LMS binding first. Lantern keeps the release pin secondary until the slot is identified."
    : approvedVersions.length === 0
    ? "Approve a version before you save a release pin."
    : "Choose the approved version this LMS slot should serve.";

  return `<div class="stack">
      <p class="section-label">Release pin</p>
      <p class="deployment-form-note">${escapeHtml(pinHint)}</p>
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
    pinEnabled ? "" : "disabled"
  } ${renderFieldAriaInvalid(editorState, "packageVersionId")}>
            ${
    !bindingSaved
      ? `<option value="">Save the binding first</option>`
      : approvedVersions.length === 0
      ? `<option value="">No approved versions available yet</option>`
      : approvedVersions
        .map(
          (version) =>
            `<option value="${escapeHtml(String(version.id))}" ${
              resolvePinnedVersionId(editorState, slot) === String(version.id)
                ? "selected"
                : ""
            }>Version ${escapeHtml(version.version)} · ${
              escapeHtml(version.title)
            }</option>`,
        )
        .join("")
  }
          </select>
          <p class="field-hint">Pending and rejected versions stay visible in history, but they cannot become active pins.</p>
          ${renderFieldError(editorState, "packageVersionId")}
        </div>
        <div class="button-row">
          <button type="submit" class="button-secondary" ${
    pinEnabled ? "" : "disabled"
  }>Save release pin</button>
        </div>
      </form>
    </div>`;
}

function renderInlineNotice(notice: AdminNotice | null): string {
  if (notice === null) {
    return "";
  }

  return `<section class="flash flash-${
    escapeHtml(notice.tone)
  } inline-flash" aria-live="polite">
    <h2>${escapeHtml(notice.title)}</h2>
    <p>${escapeHtml(notice.detail)}</p>
    ${
    (notice.items?.length ?? 0) > 0
      ? `<ul>${
        (notice.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join(
          "",
        )
      }</ul>`
      : ""
  }
  </section>`;
}

function renderFieldError(
  editorState: DeploymentEditorState | null,
  field: DeploymentEditorField,
): string {
  const message = editorState?.fieldErrors[field];

  if (!message) {
    return "";
  }

  return `<p class="field-error">${escapeHtml(message)}</p>`;
}

function renderFieldAriaInvalid(
  editorState: DeploymentEditorState | null,
  field: DeploymentEditorField,
): string {
  return editorState?.fieldErrors[field] ? 'aria-invalid="true"' : "";
}

function resolveInstallValue(
  editorState: DeploymentEditorState | null,
  field: DeploymentEditorField,
  fallback: string | null,
): string {
  const draftValue = editorState?.installValues[field];

  if (typeof draftValue === "string") {
    return draftValue;
  }

  return fallback ?? "";
}

function resolvePinnedVersionId(
  editorState: DeploymentEditorState | null,
  slot: ManagedDeploymentSlot,
): string | null {
  return editorState?.pinPackageVersionId ??
    (slot.deployment.enabledPackageVersionId === null
      ? null
      : String(slot.deployment.enabledPackageVersionId));
}

function describeSavedBindingChip(slot: ManagedDeploymentSlot): string {
  return hasSavedBinding(slot) ? "Binding saved" : "Binding not saved yet";
}

function hasSavedBinding(slot: ManagedDeploymentSlot): boolean {
  return slot.deployment.binding?.lms === slot.lms;
}

function renderSavedBindingSummary(slot: ManagedDeploymentSlot): string {
  if (!hasSavedBinding(slot)) {
    return "";
  }

  switch (slot.lms) {
    case "canvas": {
      const binding = getCanvasBinding(slot.deployment.binding);

      return `<div class="fact">
        <span class="fact-label">Saved binding</span>
        <p class="micro muted">Environment ${
        escapeHtml(describeBindingValue(binding?.canvasEnvironment))
      } · Issuer ${
        escapeHtml(describeBindingValue(binding?.issuer))
      } · Client ${
        escapeHtml(describeBindingValue(binding?.clientId))
      } · Deployment ${
        escapeHtml(describeBindingValue(binding?.deploymentId))
      }</p>
      </div>`;
    }
    case "moodle": {
      const binding = getMoodleBinding(slot.deployment.binding);

      return `<div class="fact">
        <span class="fact-label">Saved binding</span>
        <p class="micro muted">Platform ${
        escapeHtml(describeBindingValue(binding?.issuer))
      } · Client ${
        escapeHtml(describeBindingValue(binding?.clientId))
      } · Deployment ${
        escapeHtml(describeBindingValue(binding?.deploymentId))
      }</p>
      </div>`;
    }
    case "sakai": {
      const binding = getSakaiBinding(slot.deployment.binding);

      return `<div class="fact">
        <span class="fact-label">Saved binding</span>
        <p class="micro muted">Platform ${
        escapeHtml(describeBindingValue(binding?.issuer))
      } · Client ${
        escapeHtml(describeBindingValue(binding?.clientId))
      } · Deployment ${
        escapeHtml(describeBindingValue(binding?.deploymentId))
      }</p>
      </div>`;
    }
  }
}

function describeBindingStatusHeading(slot: ManagedDeploymentSlot): string {
  switch (slot.lms) {
    case "canvas":
      if (getCanvasBinding(slot.deployment.binding) === null) {
        return "Canvas binding not saved yet";
      }

      return slot.deployment.enabledPackageVersionId !== null
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

function describeEditorCopy(lms: ManagedDeploymentSlot["lms"]): string {
  switch (lms) {
    case "canvas":
      return "Setup, roster check, and the active release pin for this Canvas slot.";
    case "moodle":
      return "Exact platform values first, then the release pin for this Moodle slot.";
    case "sakai":
      return "Exact platform values first, then the release pin for this Sakai slot.";
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

function resolveSelectedEditorLms(
  slots: ManagedDeploymentSlot[],
  selectedLms: ManagedDeploymentSlot["lms"] | null,
): ManagedDeploymentSlot["lms"] {
  if (selectedLms !== null && slots.some((slot) => slot.lms === selectedLms)) {
    return selectedLms;
  }

  return slots.find((slot) => slot.persisted)?.lms ?? "canvas";
}

function getSelectedSlot(
  slots: ManagedDeploymentSlot[],
  selectedLms: ManagedDeploymentSlot["lms"],
): ManagedDeploymentSlot {
  const slot = slots.find((candidate) => candidate.lms === selectedLms);

  if (!slot) {
    throw new Error(`Managed deployment slot ${selectedLms} is required.`);
  }

  return slot;
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
