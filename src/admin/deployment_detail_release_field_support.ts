import type { CanvasEnvironmentOption } from '../lti/config.ts';
import type { DeploymentBinding } from '../lti/types.ts';
import { escapeHtml } from './layout.ts';
import type {
  DeploymentEditorField,
  DeploymentEditorState,
  ManagedDeploymentSlot,
} from './deployment_detail.ts';
import type { AdminNotice } from './layout.ts';
import {
  describeBindingValue,
  getCanvasBinding,
  getMoodleBinding,
  getSakaiBinding,
  hasPendingCanvasRegistration,
  hasSavedBinding,
} from './deployment_detail_release_support.ts';

export function renderInlineNotice(notice: AdminNotice | null): string {
  if (notice === null) {
    return '';
  }

  return `<section class="flash flash-${escapeHtml(notice.tone)} inline-flash" aria-live="polite">
    <h2>${escapeHtml(notice.title)}</h2>
    <p>${escapeHtml(notice.detail)}</p>
    ${
      (notice.items?.length ?? 0) > 0
        ? `<ul>${(notice.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : ''
    }
  </section>`;
}

export function renderSavedBindingSummary(slot: ManagedDeploymentSlot): string {
  if (hasPendingCanvasRegistration(slot)) {
    return `<div class="fact">
      <span class="fact-label">Pending connection</span>
      <p class="micro muted">Canvas created the registration, but Lantern still needs one real Canvas launch to capture the exact <code class="inline-code">deployment_id</code>.</p>
    </div>`;
  }

  if (!hasSavedBinding(slot)) {
    return '';
  }

  switch (slot.lms) {
    case 'canvas': {
      const binding = getCanvasBinding(slot.deployment.binding);

      return `<div class="fact">
        <span class="fact-label">Saved Canvas values</span>
        <p class="micro muted">Environment ${escapeHtml(
          describeBindingValue(binding?.canvasEnvironment),
        )} · Issuer ${escapeHtml(describeBindingValue(binding?.issuer))} · Client ${escapeHtml(
          describeBindingValue(binding?.clientId),
        )} · Deployment ${escapeHtml(describeBindingValue(binding?.deploymentId))}</p>
      </div>`;
    }
    case 'moodle': {
      const binding = getMoodleBinding(slot.deployment.binding);

      return `<div class="fact">
        <span class="fact-label">Saved Moodle values</span>
        <p class="micro muted">Platform ${escapeHtml(
          describeBindingValue(binding?.issuer),
        )} · Client ${escapeHtml(
          describeBindingValue(binding?.clientId),
        )} · Deployment ${escapeHtml(describeBindingValue(binding?.deploymentId))}</p>
      </div>`;
    }
    case 'sakai': {
      const binding = getSakaiBinding(slot.deployment.binding);

      return `<div class="fact">
        <span class="fact-label">Saved Sakai values</span>
        <p class="micro muted">Platform ${escapeHtml(
          describeBindingValue(binding?.issuer),
        )} · Client ${escapeHtml(
          describeBindingValue(binding?.clientId),
        )} · Deployment ${escapeHtml(describeBindingValue(binding?.deploymentId))}</p>
      </div>`;
    }
  }
}

export function renderFieldError(
  editorState: DeploymentEditorState | null,
  field: DeploymentEditorField,
): string {
  const message = editorState?.fieldErrors[field];

  if (!message) {
    return '';
  }

  return `<p class="field-error">${escapeHtml(message)}</p>`;
}

export function renderFieldAriaInvalid(
  editorState: DeploymentEditorState | null,
  field: DeploymentEditorField,
): string {
  return editorState?.fieldErrors[field] ? 'aria-invalid="true"' : '';
}

export function resolveInstallValue(
  editorState: DeploymentEditorState | null,
  field: DeploymentEditorField,
  fallback: string | null,
): string {
  const draftValue = editorState?.installValues[field];

  if (typeof draftValue === 'string') {
    return draftValue;
  }

  return fallback ?? '';
}

export function resolvePinnedVersionId(
  editorState: DeploymentEditorState | null,
  slot: ManagedDeploymentSlot,
): string | null {
  return (
    editorState?.pinPackageVersionId ??
    (slot.deployment.enabledPackageVersionId === null
      ? null
      : String(slot.deployment.enabledPackageVersionId))
  );
}

export function renderTextField(input: {
  editorState: DeploymentEditorState | null;
  field: DeploymentEditorField;
  label: string;
  id: string;
  name: string;
  placeholder: string;
  value: string | null;
}): string {
  return `<div class="field">
      <label for="${escapeHtml(input.id)}">${escapeHtml(input.label)}</label>
      <input
        id="${escapeHtml(input.id)}"
        name="${escapeHtml(input.name)}"
        type="text"
        value="${escapeHtml(resolveInstallValue(input.editorState, input.field, input.value))}"
        placeholder="${escapeHtml(input.placeholder)}"
        ${renderFieldAriaInvalid(input.editorState, input.field)}
      />
      ${renderFieldError(input.editorState, input.field)}
    </div>`;
}

export function renderCanvasEnvironmentField(input: {
  editorState: DeploymentEditorState | null;
  binding: Extract<DeploymentBinding, { lms: 'canvas' }> | null;
  supportedCanvasEnvironments: CanvasEnvironmentOption[];
  disabled: boolean;
}): string {
  return `<div class="field">
          <label for="canvas-environment">Canvas environment</label>
          <select id="canvas-environment" name="canvasEnvironment" ${
            input.disabled ? 'disabled' : ''
          } ${renderFieldAriaInvalid(input.editorState, 'canvasEnvironment')}
  }>
            ${input.supportedCanvasEnvironments
              .map(
                (environment) =>
                  `<option value="${escapeHtml(environment.id)}" ${
                    resolveInstallValue(
                      input.editorState,
                      'canvasEnvironment',
                      input.binding?.canvasEnvironment ?? null,
                    ) === environment.id
                      ? 'selected'
                      : ''
                  }>${escapeHtml(environment.label)}</option>`,
              )
              .join('')}
          </select>
          <p class="field-hint">Lantern stores the matching issuer value behind the scenes.</p>
          ${renderFieldError(input.editorState, 'canvasEnvironment')}
        </div>`;
}
