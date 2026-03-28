import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml } from './layout.ts';
import type {
  DeploymentEditorState,
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from './deployment_detail.ts';
import {
  describeBindingStatusHeading,
  describeEditorCopy,
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
          <p class="section-label">${escapeHtml(lmsLabel)} slot</p>
          <h2>${escapeHtml(lmsLabel)} setup</h2>
          <p class="deployment-form-note">${escapeHtml(
            describeManagedSlotIntro(input.slot.lms),
          )}</p>
        </div>
        <span class="chip chip-flagged">${escapeHtml(bindingStatusHeading)}</span>
      </div>
      <div class="chip-row">
        <span class="chip">Slug ${escapeHtml(input.slot.deployment.slug)}</span>
        <span class="chip">${escapeHtml(
          input.slot.deployment.enabledPackageVersionId === null
            ? 'No version pinned'
            : `Pinned ${input.slot.deployment.enabledPackageVersion ?? 'reviewed version'}`,
        )}</span>
      </div>
      <div class="deployment-tab-copy">
        <span class="deployment-tab-title">${escapeHtml(lmsLabel)} editor</span>
        <span class="deployment-tab-copy-text">${escapeHtml(
          describeEditorCopy(input.slot.lms),
        )}</span>
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
      </div>
    </section>`;
}

function renderInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
  nrpsVerification: DeploymentNrpsVerificationSummary | null;
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
