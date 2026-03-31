import {
  getLtiProfileDefinition,
  LTI_PROFILE_DEFINITIONS,
} from "../lti/profile.ts";
import type { CanvasEnvironmentOption } from "../lti/config.ts";
import type {
  LanternLtiProfileSettingsRecord,
  PackageVersionRecord,
} from "../package_review/types.ts";
import { escapeHtml } from "./layout.ts";
import type {
  DeploymentEditorState,
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from "./deployment_detail.ts";
import {
  describeBindingStatusHeading,
  describeManagedSlotIntro,
  formatLmsLabel,
} from "./deployment_detail_release_support.ts";
import { renderInlineNotice } from "./deployment_detail_release_field_support.ts";
import { renderCanvasInstallForm } from "./deployment_detail_release_canvas_form.ts";
import {
  renderMoodleInstallForm,
  renderSakaiInstallForm,
} from "./deployment_detail_release_non_canvas_forms.ts";
import {
  renderCanvasRosterVerification,
  renderVersionPinForm,
} from "./deployment_detail_release_pin_section.ts";

export function renderSelectedSlotPanel(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
  lanternLtiProfileSettings: LanternLtiProfileSettingsRecord;
  canvasConfigUrl: string | null;
  canvasDynamicRegistrationUrl: string | null;
  moodleDynamicRegistrationUrl: string | null;
  sakaiDynamicRegistrationUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  approvedVersions: PackageVersionRecord[];
  history: PackageVersionRecord[];
}): string {
  const lmsLabel = formatLmsLabel(input.slot.lms);
  const bindingStatusHeading = describeBindingStatusHeading(input.slot);

  return `<section id="slot-panel" class="deployment-tab-panel stack">
      <div class="table-row-top">
        <div class="stack">
          <p class="section-label">${escapeHtml(lmsLabel)} settings</p>
          <h2>Set up ${escapeHtml(lmsLabel)}</h2>
          <p class="deployment-form-note">${
    escapeHtml(
      describeManagedSlotIntro(input.slot.lms),
    )
  }</p>
        </div>
        <span class="chip chip-flagged">${
    escapeHtml(bindingStatusHeading)
  }</span>
      </div>
      <div class="facts deployment-summary-grid">
        <div class="fact">
          <span class="fact-label">Setup status</span>
          <span class="fact-value">${escapeHtml(bindingStatusHeading)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">Live version</span>
          <span class="fact-value">${
    escapeHtml(
      input.slot.deployment.enabledPackageVersionId === null
        ? "Not chosen yet"
        : (input.slot.deployment.enabledPackageVersion ?? "Reviewed version"),
    )
  }</span>
        </div>
        ${renderLtiProfileFacts(input.slot, input.lanternLtiProfileSettings)}
      </div>
      ${renderInlineNotice(input.editorState?.notice ?? null)}
      <div class="deployment-tab-body stack">
        ${renderInstallForm(input)}
        ${
    renderLtiProfileForm(
      input.appId,
      input.slot,
      input.lanternLtiProfileSettings,
    )
  }
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
  lanternLtiProfileSettings: LanternLtiProfileSettingsRecord;
  canvasConfigUrl: string | null;
  canvasDynamicRegistrationUrl: string | null;
  moodleDynamicRegistrationUrl: string | null;
  sakaiDynamicRegistrationUrl: string | null;
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

function renderLtiProfileFacts(
  slot: ManagedDeploymentSlot,
  lanternLtiProfileSettings: LanternLtiProfileSettingsRecord,
): string {
  const defaultProfile = getLtiProfileDefinition(
    lanternLtiProfileSettings.defaultLtiProfile,
  );
  const overrideProfile = slot.deployment.ltiProfileOverride === null
    ? null
    : getLtiProfileDefinition(slot.deployment.ltiProfileOverride);
  const effectiveProfile = overrideProfile ?? defaultProfile;

  return `
        <div class="fact">
          <span class="fact-label">Lantern default</span>
          <span class="fact-value">${escapeHtml(defaultProfile.label)}</span>
        </div>
        <div class="fact">
          <span class="fact-label">This setup</span>
          <span class="fact-value">${
    escapeHtml(
      overrideProfile === null
        ? "Uses Lantern default"
        : `Overrides with ${overrideProfile.label}`,
    )
  }</span>
        </div>
        <div class="fact">
          <span class="fact-label">Effective profile</span>
          <span class="fact-value">${escapeHtml(effectiveProfile.label)}</span>
        </div>`;
}

function renderLtiProfileForm(
  appId: string,
  slot: ManagedDeploymentSlot,
  lanternLtiProfileSettings: LanternLtiProfileSettingsRecord,
): string {
  const defaultProfile = getLtiProfileDefinition(
    lanternLtiProfileSettings.defaultLtiProfile,
  );
  const selectedValue = slot.deployment.ltiProfileOverride;
  const disabled = slot.persisted ? "" : "disabled";

  return `<section class="stack">
      <p class="section-label">LTI behavior</p>
      <h3>Choose how strict Lantern should be</h3>
      <p class="deployment-form-note">Use the Lantern default for this setup, or save one explicit profile for this LMS slot.</p>
      <form method="post" action="/admin/packages/${
    encodeURIComponent(appId)
  }/deployment/lti-profile" class="stack">
        <input type="hidden" name="lms" value="${escapeHtml(slot.lms)}">
        <div class="field">
          <span>Saved profile</span>
          <div class="detail-stack">
            <label class="choice-row">
              <input
                type="radio"
                name="ltiProfileOverride"
                value=""
                ${selectedValue === null ? "checked" : ""}
                ${disabled}
              >
              <span>
                <strong>Use Lantern default</strong>
                <span class="micro muted">${
    escapeHtml(defaultProfile.label)
  }. ${escapeHtml(defaultProfile.summary)}</span>
              </span>
            </label>
            ${
    LTI_PROFILE_DEFINITIONS.map((profile) =>
      `<label class="choice-row">
                  <input
                    type="radio"
                    name="ltiProfileOverride"
                    value="${escapeHtml(profile.id)}"
                    ${selectedValue === profile.id ? "checked" : ""}
                    ${disabled}
                  >
                  <span>
                    <strong>${escapeHtml(profile.label)}</strong>
                    <span class="micro muted">${
        escapeHtml(profile.summary)
      }</span>
                  </span>
                </label>`
    ).join("")
  }
          </div>
          <p class="field-hint">${
    escapeHtml(
      slot.persisted
        ? "Saving an explicit profile only affects this LMS setup."
        : "Save the app settings first. Lantern only stores an override after this LMS slot exists.",
    )
  }</p>
        </div>
        <div class="button-row">
          <button type="submit" ${disabled}>Save LTI profile</button>
        </div>
      </form>
    </section>`;
}
