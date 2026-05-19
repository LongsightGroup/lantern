import { getLtiProfileDefinition, LTI_PROFILE_DEFINITIONS } from '../lti/profile.ts';
import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type {
  LanternLtiProfileSettingsRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { escapeHtml } from './layout.ts';
import type {
  DeploymentEditorState,
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from './deployment_detail.ts';
import {
  describeBindingStatusChipClass,
  describeBindingStatusHeading,
  describeManagedSlotIntro,
  formatLmsLabel,
} from './deployment_detail_release_support.ts';
import { renderInlineNotice } from './deployment_detail_release_field_support.ts';
import { renderCanvasInstallForm } from './deployment_detail_release_canvas_form.ts';
import {
  renderMoodleInstallForm,
  renderSakaiInstallForm,
} from './deployment_detail_release_non_canvas_forms.ts';
import {
  renderCanvasRosterVerification,
  renderVersionPinForm,
} from './deployment_detail_release_pin_section.ts';

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
  const bindingStatusChipClass = describeBindingStatusChipClass(input.slot);

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
        <span class="chip ${escapeHtml(bindingStatusChipClass)}">${
    escapeHtml(
      bindingStatusHeading,
    )
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
        ? 'Not chosen yet'
        : (input.slot.deployment.enabledPackageVersion ?? 'Reviewed version'),
    )
  }</span>
        </div>
        ${renderLtiProfileFacts(input.slot, input.lanternLtiProfileSettings)}
      </div>
      ${renderInlineNotice(input.editorState?.notice ?? null)}
      <div class="deployment-tab-body stack">
        ${renderInstallForm(input)}
        ${
    input.slot.lms === 'canvas'
      ? renderCanvasRosterVerification(input.appId, input.slot, input.nrpsVerification)
      : ''
  }
        ${renderVersionPinForm(input.appId, input.slot, input.editorState, input.approvedVersions)}
        ${renderLtiProfileForm(input.appId, input.slot, input.lanternLtiProfileSettings)}
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
    case 'canvas':
      return renderCanvasInstallForm(input);
    case 'moodle':
      return renderMoodleInstallForm(input);
    case 'sakai':
      return renderSakaiInstallForm(input);
  }
}

function renderLtiProfileFacts(
  slot: ManagedDeploymentSlot,
  lanternLtiProfileSettings: LanternLtiProfileSettingsRecord,
): string {
  const defaultProfile = getLtiProfileDefinition(lanternLtiProfileSettings.defaultLtiProfile);
  const overrideProfile = slot.deployment.ltiProfileOverride === null
    ? null
    : getLtiProfileDefinition(slot.deployment.ltiProfileOverride);
  const effectiveProfile = overrideProfile ?? defaultProfile;

  return `
        <div class="fact">
          <span class="fact-label">LTI behavior</span>
          <span class="fact-value">${escapeHtml(effectiveProfile.label)}</span>
          <p class="micro muted">${
    escapeHtml(
      overrideProfile === null
        ? `Uses Lantern default. ${defaultProfile.summary}`
        : `Saved only for this LMS setup. ${overrideProfile.summary}`,
    )
  }</p>
        </div>`;
}

function renderLtiProfileForm(
  appId: string,
  slot: ManagedDeploymentSlot,
  lanternLtiProfileSettings: LanternLtiProfileSettingsRecord,
): string {
  const defaultProfile = getLtiProfileDefinition(lanternLtiProfileSettings.defaultLtiProfile);
  const selectedValue = slot.deployment.ltiProfileOverride;
  const overrideProfile = selectedValue === null ? null : getLtiProfileDefinition(selectedValue);
  const disabled = slot.persisted ? '' : 'disabled';
  const currentMode = overrideProfile === null
    ? `Using Lantern default (${defaultProfile.label})`
    : `Saved override (${overrideProfile.label})`;
  const detailsOpen = selectedValue === null ? '' : 'open';
  const currentSummary = overrideProfile?.summary ?? defaultProfile.summary;

  return `<details class="advanced-details" ${detailsOpen}>
      <summary>Advanced LTI behavior override</summary>
      <div class="advanced-details-body stack">
        <p class="deployment-form-note">Most LMS setups should inherit the Lantern default. Save an override only when this setup needs a different enforcement profile.</p>
        <div class="fact">
          <span class="fact-label">Current mode</span>
          <span class="fact-value">${escapeHtml(currentMode)}</span>
          <p class="micro muted">${escapeHtml(currentSummary)}</p>
        </div>
        <form method="post" action="/admin/packages/${
    encodeURIComponent(
      appId,
    )
  }/deployment/lti-profile" class="stack">
          <input type="hidden" name="lms" value="${escapeHtml(slot.lms)}">
          <div class="field">
            <span>Saved override</span>
            <div class="detail-stack">
              <label class="choice-row">
                <input
                  type="radio"
                  name="ltiProfileOverride"
                  value=""
                  ${selectedValue === null ? 'checked' : ''}
                  ${disabled}
                >
                <span>
                  <strong>Use Lantern default</strong>
                  <span class="micro muted">${
    escapeHtml(
      defaultProfile.label,
    )
  }. ${escapeHtml(defaultProfile.summary)}</span>
                </span>
              </label>
              ${
    LTI_PROFILE_DEFINITIONS.map(
      (profile) =>
        `<label class="choice-row">
                  <input
                    type="radio"
                    name="ltiProfileOverride"
                    value="${escapeHtml(profile.id)}"
                    ${selectedValue === profile.id ? 'checked' : ''}
                    ${disabled}
                  >
                  <span>
                    <strong>${escapeHtml(profile.label)}</strong>
                    <span class="micro muted">${escapeHtml(profile.summary)}</span>
                  </span>
                </label>`,
    ).join('')
  }
            </div>
            <p class="field-hint">${
    escapeHtml(
      slot.persisted
        ? 'Saving here only changes this LMS setup.'
        : 'Save the app settings first. Lantern only stores an override after this LMS slot exists.',
    )
  }</p>
          </div>
          <div class="button-row">
            <button type="submit" ${disabled}>Save LTI behavior</button>
          </div>
        </form>
      </div>
    </details>`;
}
