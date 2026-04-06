import { describeDeploymentPin } from '../package_review/summary.ts';
import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type {
  LanternLtiProfileSettingsRecord,
  PackageVersionRecord,
} from '../package_review/types.ts';
import { escapeHtml } from './layout.ts';
import {
  getSelectedManagedDeploymentSlot,
  resolveSelectedManagedDeploymentLms,
} from './deployment_detail.ts';
import type {
  DeploymentEditorState,
  DeploymentNrpsVerificationSummary,
  ManagedDeploymentSlot,
} from './deployment_detail.ts';
import {
  describeBindingStatusHeading,
  formatLmsLabel,
} from './deployment_detail_release_support.ts';
import { renderSelectedSlotPanel } from './deployment_detail_release_forms.ts';

export function renderManagedDeploymentSections(input: {
  appId: string;
  slots: ManagedDeploymentSlot[];
  selectedLms: ManagedDeploymentSlot['lms'] | null;
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
  const selectedLms = resolveSelectedManagedDeploymentLms(input.slots, input.selectedLms);
  const selectedSlot = getSelectedManagedDeploymentSlot(input.slots, input.selectedLms);

  return `<section class="panel">
      <div class="panel-body stack">
        <p class="section-label">Connections</p>
        <h2>Choose your LMS.</h2>
        <p>Most teams only need one tab. Open Advanced settings only when you need exact IDs or URLs.</p>
        <nav class="deployment-tab-strip" aria-label="App settings">
          ${input.slots
            .map((slot) =>
              renderLmsTab({
                appId: input.appId,
                slot,
                selectedLms,
              }),
            )
            .join('')}
        </nav>
        ${renderSelectedSlotPanel({
          appId: input.appId,
          slot: selectedSlot,
          editorState: input.editorState?.lms === selectedSlot.lms ? input.editorState : null,
          nrpsVerification: input.nrpsVerification,
          lanternLtiProfileSettings: input.lanternLtiProfileSettings,
          canvasConfigUrl: input.canvasConfigUrl,
          canvasDynamicRegistrationUrl: input.canvasDynamicRegistrationUrl,
          moodleDynamicRegistrationUrl: input.moodleDynamicRegistrationUrl,
          sakaiDynamicRegistrationUrl: input.sakaiDynamicRegistrationUrl,
          supportedCanvasEnvironments: input.supportedCanvasEnvironments,
          approvedVersions: input.approvedVersions,
          history: input.history,
        })}
      </div>
    </section>`;
}

function renderLmsTab(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  selectedLms: ManagedDeploymentSlot['lms'];
}): string {
  const lmsLabel = formatLmsLabel(input.slot.lms);
  const editorHref = `/admin/packages/${encodeURIComponent(
    input.appId,
  )}/deployment?lms=${encodeURIComponent(input.slot.lms)}#slot-panel`;
  const bindingStatusHeading = describeBindingStatusHeading(input.slot);
  const pinStatus = describeDeploymentPin(input.slot.persisted ? input.slot.deployment : null);

  return `<a class="deployment-tab ${
    input.selectedLms === input.slot.lms ? 'active' : ''
  }" href="${escapeHtml(editorHref)}" ${
    input.selectedLms === input.slot.lms ? 'aria-current="page"' : ''
  }>
      <span class="deployment-tab-label">${escapeHtml(lmsLabel)}</span>
      <span class="deployment-tab-note">${escapeHtml(bindingStatusHeading)}</span>
      <span class="deployment-tab-note">${escapeHtml(pinStatus)}</span>
    </a>`;
}
