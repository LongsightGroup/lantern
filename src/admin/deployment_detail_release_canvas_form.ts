import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type { PackageVersionRecord } from '../package_review/types.ts';
import { escapeHtml } from './layout.ts';
import type { DeploymentEditorState, ManagedDeploymentSlot } from './deployment_detail.ts';
import {
  renderCanvasEnvironmentField,
  renderSavedBindingSummary,
  renderTextField,
} from './deployment_detail_release_field_support.ts';
import { getCanvasBinding } from './deployment_detail_release_support.ts';

export function renderCanvasInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
  canvasConfigUrl: string | null;
  canvasDynamicRegistrationUrl: string | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  history: PackageVersionRecord[];
}): string {
  const binding = getCanvasBinding(input.slot.deployment.binding);
  const configDisabled = input.canvasConfigUrl === null;
  const advancedOpen = input.editorState?.focusSection === 'install';

  return `<div class="stack">
      <p class="section-label">Canvas setup</p>
      <p class="deployment-form-note">Use Dynamic Registration first. Open Advanced Canvas settings only if you need to enter values by hand.</p>
      <div class="stack">
        <p class="section-label">Dynamic Registration</p>
        <p class="deployment-form-note">In Canvas, open Install a New App, choose LTI 1.3, set Install Method to Dynamic Registration, and paste this URL.</p>
        <div class="fact">
          <span class="fact-label">Dynamic Registration URL</span>
          <code class="inline-code">${
    escapeHtml(
      input.canvasDynamicRegistrationUrl ??
        'APP_ORIGIN is required before Lantern can publish the Canvas registration URL.',
    )
  }</code>
        </div>
        ${
    input.canvasDynamicRegistrationUrl === null
      ? `<div class="callout">
          <h3>Dynamic Registration URL unavailable</h3>
          <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt Canvas setup. Lantern will not guess public callback URLs from the local request.</p>
        </div>`
      : ''
  }
      </div>
      <details class="advanced-details" ${advancedOpen ? 'open' : ''}>
        <summary>Advanced Canvas settings</summary>
        <div class="advanced-details-body stack">
          <p class="deployment-form-note">Use this only if you need the Client ID, Deployment ID, or Configuration URL by hand.</p>
          ${renderSavedBindingSummary(input.slot)}
          <div class="fact">
            <span class="fact-label">Configuration URL</span>
            <code class="inline-code">${
    escapeHtml(
      input.canvasConfigUrl ??
        'APP_ORIGIN is required before Lantern can publish the config URL.',
    )
  }</code>
          </div>
          ${
    input.canvasConfigUrl === null
      ? `<div class="callout">
          <h3>Configuration URL unavailable</h3>
          <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt the Canvas install flow. Lantern will not guess public launch URLs from the local request.</p>
        </div>`
      : ''
  }
          <form method="post" action="/admin/packages/${
    escapeHtml(
      input.appId,
    )
  }/deployment/install" class="stack">
            <input type="hidden" name="lms" value="canvas" />
            ${
    renderCanvasEnvironmentField({
      editorState: input.editorState,
      binding,
      supportedCanvasEnvironments: input.supportedCanvasEnvironments,
      disabled: configDisabled,
    })
  }
            ${
    renderTextField({
      editorState: input.editorState,
      field: 'clientId',
      label: 'Client ID',
      id: 'canvas-client-id',
      name: 'clientId',
      placeholder: '10000000000001',
      value: binding?.clientId ?? null,
    })
  }
            ${
    renderTextField({
      editorState: input.editorState,
      field: 'deploymentId',
      label: 'Deployment ID',
      id: 'canvas-deployment-id',
      name: 'deploymentId',
      placeholder: 'deployment-123',
      value: binding?.deploymentId ?? null,
    })
  }
            <div class="button-row">
              <button type="submit" class="button-primary" ${
    configDisabled ? 'disabled' : ''
  }>Save Canvas settings</button>
            </div>
          </form>
        </div>
      </details>
    </div>`;
}
