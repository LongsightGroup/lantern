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

  return `<div class="stack">
      <p class="section-label">Setup</p>
      <p class="deployment-form-note">Use Lantern's hosted config URL when you create or update the Canvas tool, then save the environment, Client ID, and Deployment ID here.</p>
      <div class="stack">
        <p class="section-label">Dynamic registration</p>
        <p class="deployment-form-note">Paste this registration URL into Canvas's LTI registration flow. Lantern will save the Canvas environment and Client ID immediately, then finish the exact deployment binding on the first real Canvas launch.</p>
        <div class="fact">
          <span class="fact-label">Registration URL</span>
          <code class="inline-code">${escapeHtml(
            input.canvasDynamicRegistrationUrl ??
              'APP_ORIGIN is required before Lantern can publish the Canvas registration URL.',
          )}</code>
        </div>
        ${
          input.canvasDynamicRegistrationUrl === null
            ? `<div class="callout">
          <h3>Registration URL unavailable</h3>
          <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt Canvas dynamic registration. Lantern will not guess public callback URLs from the local request.</p>
        </div>`
            : ''
        }
      </div>
      ${renderSavedBindingSummary(input.slot)}
      <div class="fact">
        <span class="fact-label">Config URL</span>
        <code class="inline-code">${escapeHtml(
          input.canvasConfigUrl ??
            'APP_ORIGIN is required before Lantern can publish the config URL.',
        )}</code>
      </div>
      ${
        input.canvasConfigUrl === null
          ? `<div class="callout">
          <h3>Config URL unavailable</h3>
          <p>Set <code class="inline-code">APP_ORIGIN</code> before you attempt the Canvas install flow. Lantern will not guess public launch URLs from the local request.</p>
        </div>`
          : ''
      }
      <form method="post" action="/admin/packages/${escapeHtml(
        input.appId,
      )}/deployment/install" class="stack">
        <input type="hidden" name="lms" value="canvas" />
        ${renderCanvasEnvironmentField({
          editorState: input.editorState,
          binding,
          supportedCanvasEnvironments: input.supportedCanvasEnvironments,
          disabled: configDisabled,
        })}
        ${renderTextField({
          editorState: input.editorState,
          field: 'clientId',
          label: 'Canvas Client ID',
          id: 'canvas-client-id',
          name: 'clientId',
          placeholder: '10000000000001',
          value: binding?.clientId ?? null,
        })}
        ${renderTextField({
          editorState: input.editorState,
          field: 'deploymentId',
          label: 'Canvas Deployment ID',
          id: 'canvas-deployment-id',
          name: 'deploymentId',
          placeholder: 'deployment-123',
          value: binding?.deploymentId ?? null,
        })}
        <div class="button-row">
          <button type="submit" class="button-primary" ${
            configDisabled ? 'disabled' : ''
          }>Save Canvas</button>
        </div>
      </form>
    </div>`;
}
