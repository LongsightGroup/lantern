import { escapeHtml } from './layout.ts';
import type { DeploymentEditorState, ManagedDeploymentSlot } from './deployment_detail.ts';
import {
  renderSavedBindingSummary,
  renderTextField,
} from './deployment_detail_release_field_support.ts';
import { getMoodleBinding, getSakaiBinding } from './deployment_detail_release_support.ts';

export function renderMoodleInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
  moodleDynamicRegistrationUrl: string | null;
}): string {
  const binding = getMoodleBinding(input.slot.deployment.binding);
  const advancedOpen = input.editorState?.focusSection === 'install';

  return `<div class="stack">
      <p class="section-label">Moodle setup</p>
      <p class="deployment-form-note">Use Moodle's setup link first. Open Advanced Moodle settings only if you need to enter values by hand.</p>
      <div class="stack">
        <p class="section-label">Automatic setup</p>
        <p class="deployment-form-note">Paste this URL into Moodle's Add LTI Advantage screen. Moodle sends the saved values back here automatically.</p>
        <div class="fact">
          <span class="fact-label">Tool URL</span>
          <code class="inline-code">${escapeHtml(
            input.moodleDynamicRegistrationUrl ??
              'APP_ORIGIN is required before Lantern can publish the Moodle registration URL.',
          )}</code>
        </div>
      </div>
      <details class="advanced-details" ${advancedOpen ? 'open' : ''}>
        <summary>Advanced Moodle settings</summary>
        <div class="advanced-details-body stack">
          <p class="deployment-form-note">Enter exact values only if you need to bypass automatic setup.</p>
          ${renderSavedBindingSummary(input.slot)}
          <form method="post" action="/admin/packages/${escapeHtml(
            input.appId,
          )}/deployment/install" class="stack">
            <input type="hidden" name="lms" value="moodle" />
            ${renderTextField({
              editorState: input.editorState,
              field: 'issuer',
              label: 'Platform ID',
              id: 'moodle-issuer',
              name: 'issuer',
              placeholder: 'https://moodle.example',
              value: binding?.issuer ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'clientId',
              label: 'Client ID',
              id: 'moodle-client-id',
              name: 'clientId',
              placeholder: 'moodle-client-123',
              value: binding?.clientId ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'deploymentId',
              label: 'Deployment ID',
              id: 'moodle-deployment-id',
              name: 'deploymentId',
              placeholder: 'moodle-deployment-123',
              value: binding?.deploymentId ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'authorizationEndpoint',
              label: 'Authorization endpoint',
              id: 'moodle-authorization-endpoint',
              name: 'authorizationEndpoint',
              placeholder: 'https://moodle.example/mod/lti/auth.php',
              value: binding?.authorizationEndpoint ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'accessTokenUrl',
              label: 'Access token URL',
              id: 'moodle-access-token-url',
              name: 'accessTokenUrl',
              placeholder: 'https://moodle.example/mod/lti/token.php',
              value: binding?.accessTokenUrl ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'jwksUrl',
              label: 'Public keyset URL',
              id: 'moodle-jwks-url',
              name: 'jwksUrl',
              placeholder: 'https://moodle.example/mod/lti/certs.php',
              value: binding?.jwksUrl ?? null,
            })}
            <div class="button-row">
              <button type="submit" class="button-primary">Save Moodle settings</button>
            </div>
          </form>
        </div>
      </details>
    </div>`;
}

export function renderSakaiInstallForm(input: {
  appId: string;
  slot: ManagedDeploymentSlot;
  editorState: DeploymentEditorState | null;
  sakaiDynamicRegistrationUrl: string | null;
}): string {
  const binding = getSakaiBinding(input.slot.deployment.binding);
  const advancedOpen = input.editorState?.focusSection === 'install';

  return `<div class="stack">
      <p class="section-label">Sakai setup</p>
      <p class="deployment-form-note">Use Sakai's setup link first. Open Advanced Sakai settings only if you need to enter values by hand.</p>
      <div class="stack">
        <p class="section-label">Automatic setup</p>
        <p class="deployment-form-note">Paste this URL into Sakai's LTI Dynamic Registration flow. Sakai opens it and sends the setup values back automatically.</p>
        <div class="fact">
          <span class="fact-label">Dynamic Registration URL</span>
          <code class="inline-code">${escapeHtml(
            input.sakaiDynamicRegistrationUrl ??
              'APP_ORIGIN is required before Lantern can publish the Sakai registration URL.',
          )}</code>
        </div>
      </div>
      <details class="advanced-details" ${advancedOpen ? 'open' : ''}>
        <summary>Advanced Sakai settings</summary>
        <div class="advanced-details-body stack">
          <p class="deployment-form-note">Only use these settings if you need to enter Sakai values by hand.</p>
          ${renderSavedBindingSummary(input.slot)}
          <form method="post" action="/admin/packages/${escapeHtml(
            input.appId,
          )}/deployment/install" class="stack">
            <input type="hidden" name="lms" value="sakai" />
            ${renderTextField({
              editorState: input.editorState,
              field: 'issuer',
              label: 'Platform ID',
              id: 'sakai-issuer',
              name: 'issuer',
              placeholder: 'https://sakai.example',
              value: binding?.issuer ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'clientId',
              label: 'Client ID',
              id: 'sakai-client-id',
              name: 'clientId',
              placeholder: 'sakai-client-123',
              value: binding?.clientId ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'deploymentId',
              label: 'Deployment ID',
              id: 'sakai-deployment-id',
              name: 'deploymentId',
              placeholder: 'sakai-deployment-123',
              value: binding?.deploymentId ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'authorizationEndpoint',
              label: 'Authorization endpoint',
              id: 'sakai-authorization-endpoint',
              name: 'authorizationEndpoint',
              placeholder: 'https://sakai.example/imsoidc/lti13/oidc_auth',
              value: binding?.authorizationEndpoint ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'accessTokenUrl',
              label: 'Access token URL',
              id: 'sakai-access-token-url',
              name: 'accessTokenUrl',
              placeholder: 'https://sakai.example/imsblis/lti13/token/3',
              value: binding?.accessTokenUrl ?? null,
            })}
            ${renderTextField({
              editorState: input.editorState,
              field: 'jwksUrl',
              label: 'Public keyset URL',
              id: 'sakai-jwks-url',
              name: 'jwksUrl',
              placeholder: 'https://sakai.example/imsblis/lti13/keyset',
              value: binding?.jwksUrl ?? null,
            })}
            <div class="button-row">
              <button type="submit" class="button-primary">Save Sakai settings</button>
            </div>
          </form>
        </div>
      </details>
    </div>`;
}
